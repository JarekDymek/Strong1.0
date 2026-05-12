/**
 * js/stopwatch.js — Strong22 NextGen v3 — FINALNA WERSJA
 *
 * ARCHITEKTURA DECYZJA:
 * Używamy pojedynczego globalnego AudioContext (singleton) zamiast
 * tworzenia nowego przy każdym dźwięku. AudioContext jest odblokowany
 * przy PIERWSZYM kliknięciu w DOWOLNE miejsce strony (document-level listener),
 * co eliminuje problem z iOS/Safari całkowicie. Następnie każde wywołanie
 * tone() sprawdza stan i wznawia jeśli suspended.
 *
 * MARTWE ŚCIEŻKI WYELIMINOWANE:
 * - Usunięto import showNotification z ui.js (circular dependency risk)
 * - Usunięto requestFullscreen (na iOS wywołuje błąd w iframe/standalone)
 * - Usunięto sw-hint-pulse (nazwa nie zgadzała się z CSS)
 * - Uproszczono obsługę touch — jeden handler touchend zamiast trzech
 */

import { getCompetitorProfile } from './state.js';

/* ═══════════════════════════════════════════════════════
   AUDIO ENGINE — Web Audio API
   Singleton AudioContext, odblokowany przy pierwszej interakcji
═══════════════════════════════════════════════════════ */
let _ctx = null;
let _audioUnlocked = false;

/** Inicjalizuje i zwraca AudioContext. Wołaj przy pierwszej interakcji użytkownika. */
function getCtx() {
  if (!_ctx) {
    try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
  }
  if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
  return _ctx;
}

/** Odblokowanie audio na iOS — pierwszy klik/touch na DOWOLNY element strony */
function unlockAudio() {
  if (_audioUnlocked) return;
  const ctx = getCtx();
  if (!ctx) return;
  // Zagraj milczący bufor — wymusza wyjście z suspended
  const buf = ctx.createBuffer(1, 1, 22050);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(0);
  _audioUnlocked = true;
}

/** Rejestruje globalny listener odblokowania audio */
export function initAudio() {
  ['touchstart','touchend','mousedown','keydown'].forEach(ev => {
    document.addEventListener(ev, function handler() {
      unlockAudio();
      document.removeEventListener(ev, handler);
    }, { once: true, passive: true });
  });
}

/** Generuje pojedynczy ton syntetyczny */
function tone(freq, shape, dur, vol, delay = 0) {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = shape;
    osc.frequency.value = freq;
    const t = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, t + Math.max(dur, 0.05));
    osc.start(t);
    osc.stop(t + Math.max(dur, 0.05) + 0.01);
  } catch (e) { /* Ignoruj — nie blokuj UI */ }
}

/* ─── Katalog sygnałów dźwiękowych ─── */

/** 3 rosnące tony kwadratowe — START */
export function signalStart() {
  tone(660,  'square', 0.10, 0.55, 0.00);
  tone(880,  'square', 0.10, 0.65, 0.14);
  tone(1100, 'square', 0.18, 0.72, 0.28);
}
/** 2 opadające tony sinusoidalne — STOP */
export function signalStop() {
  tone(880, 'sine', 0.14, 0.62, 0.00);
  tone(550, 'sine', 0.20, 0.50, 0.16);
}
/** Krótki klik wysokotonowy — POWTÓRZENIE */
export function signalRep() {
  tone(1320, 'square', 0.045, 0.48);
}
/** Podwójny ton potwierdzenia — MIĘDZYCZAS */
export function signalLap() {
  tone(880,  'sine', 0.09, 0.48, 0.00);
  tone(1100, 'sine', 0.09, 0.52, 0.13);
}
/** Pulsujący sygnał piłokształtny × 3 — OSTRZEŻENIE */
export function signalWarning() {
  tone(320, 'sawtooth', 0.16, 0.72, 0.00);
  tone(260, 'sawtooth', 0.16, 0.72, 0.21);
  tone(320, 'sawtooth', 0.16, 0.72, 0.42);
}
/** 2 rosnące tony — ZAPIS/SUKCES */
export function signalSave() {
  tone(660,  'sine', 0.08, 0.44, 0.00);
  tone(1100, 'sine', 0.14, 0.54, 0.12);
}
/** 6-tonowa fanfara — FINAŁ */
export function signalFanfare() {
  [[660,0],[880,0.14],[1100,0.28],[880,0.42],[1100,0.56],[1320,0.70]]
    .forEach(([f, d]) => tone(f, 'square', 0.13, 0.42, d));
}
/** Sygnał przyznania punktów — kombinacja 3 tonów */
export function signalPoints() {
  tone(880,  'sine', 0.10, 0.50, 0.00);
  tone(1100, 'sine', 0.12, 0.55, 0.13);
  tone(1320, 'sine', 0.18, 0.60, 0.27);
}
/** Sygnał przejścia do następnej konkurencji */
export function signalNext() {
  tone(660, 'square', 0.08, 0.45, 0.00);
  tone(880, 'square', 0.10, 0.50, 0.10);
}

/* ═══════════════════════════════════════════════════════
   VIBRATION ENGINE
═══════════════════════════════════════════════════════ */
export const VIB = {
  start:   () => vib([80, 40, 80, 40, 160]),
  stop:    () => vib([160, 60, 80]),
  rep:     () => vib([28]),
  lap:     () => vib([55, 35, 55]),
  warning: () => vib([200, 100, 200, 100, 200]),
  save:    () => vib([100, 50, 200]),
  fanfare: () => vib([100,50,100,50,200,50,300]),
  next:    () => vib([60, 40, 120]),
};
function vib(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
}

/* ═══════════════════════════════════════════════════════
   GRAFIKI KONKURENCJI
═══════════════════════════════════════════════════════ */
const EVENT_MAP = [
  { k:['finał','final'],                       e:'🏆',color:'#FFB800',bg:'rgba(26,18,0,0.96)'},
  { k:['farmer','spacer farmera','farmers'],   e:'🌾',color:'#FFB800',bg:'rgba(26,16,0,0.96)'},
  { k:['atlas','atlasy','atlas stones'],        e:'🪨',color:'#A855F7',bg:'rgba(15,5,24,0.96)'},
  { k:['log','kłoda','log lift'],              e:'🪵',color:'#78716C',bg:'rgba(16,14,12,0.96)'},
  { k:['deadlift','martwy ciąg','martwy'],     e:'💀',color:'#EF4444',bg:'rgba(26,0,0,0.96)'},
  { k:['yoke','jarzmo'],                       e:'🐂',color:'#F97316',bg:'rgba(26,8,0,0.96)'},
  { k:['car','samochód','truck'],              e:'🚗',color:'#3B82F6',bg:'rgba(0,10,26,0.96)'},
  { k:['tire','opona'],                        e:'⭕',color:'#10B981',bg:'rgba(0,26,14,0.96)'},
  { k:['keg','beczka'],                        e:'🛢️',color:'#F59E0B',bg:'rgba(26,16,0,0.96)'},
  { k:['sandbag','worek','bag'],               e:'💼',color:'#92400E',bg:'rgba(26,10,0,0.96)'},
  { k:['husafell','husafall'],                 e:'🏰',color:'#9333EA',bg:'rgba(15,0,24,0.96)'},
  { k:['overhead','press','wyciskanie','axle'],e:'💪',color:'#EC4899',bg:'rgba(26,0,16,0.96)'},
  { k:['conan','wheel'],                       e:'☸️', color:'#F97316',bg:'rgba(26,8,0,0.96)'},
  { k:['medley'],                              e:'🎯',color:'#14B8A6',bg:'rgba(0,24,20,0.96)'},
  { k:['kula'],                                e:'🎱',color:'#60A5FA',bg:'rgba(0,8,26,0.96)'},
];
const EV_DEFAULT = { e:'⚡', color:'#FF4500', bg:'rgba(26,5,0,0.96)' };

export function getEventVisual(name = '') {
  const l = name.toLowerCase();
  return EVENT_MAP.find(r => r.k.some(k => l.includes(k))) || EV_DEFAULT;
}

/* ═══════════════════════════════════════════════════════
   NOTIFICATION (własna implementacja bez importu z ui.js)
   Eliminuje potencjalną circular dependency
═══════════════════════════════════════════════════════ */
let _notifTimer = null;
function notify(msg, type = 'info', ms = 2200) {
  const bar = document.getElementById('notification-bar');
  if (!bar) return;
  const icons = { success:'✅', error:'❌', info:'ℹ️' };
  bar.innerHTML = `${icons[type]||''} ${msg}`;
  bar.className = type;
  bar.classList.add('show');
  clearTimeout(_notifTimer);
  _notifTimer = setTimeout(() => bar.classList.remove('show'), ms);
}

/* ═══════════════════════════════════════════════════════
   STAN WEWNĘTRZNY STOPERA
═══════════════════════════════════════════════════════ */
let E = {};           // Elementy DOM — inicjowane w initStopwatch()
let _rafId = null;    // requestAnimationFrame ID
let _startTs  = 0;    // timestamp startu
let _elapsed  = 0;    // ms — czas narastający
let _running  = false;
let _mode     = null; // 'reps' | 'laps' | null
let _reps     = 0;
let _laps     = [];   // ms timestamps
let _onSave   = null; // callback(name, result, eventType)
let _compName = '';
let _eventName = '';

/* ═══════════════════════════════════════════════════════
   INIT — zbierz referencje DOM raz, używaj zawsze
═══════════════════════════════════════════════════════ */
export function initStopwatch() {
  E = {
    root:      document.getElementById('fullscreenStopwatch'),
    time:      document.getElementById('fsTime'),
    name:      document.getElementById('fsCompetitorName'),
    photo:     document.getElementById('fsCompetitorPhoto'),
    startBtn:  document.getElementById('fsStartStopBtn'),
    postStop:  document.getElementById('fsPostStopControls'),
    repsBtn:   document.getElementById('fsRepsBtn'),
    lapsBtn:   document.getElementById('fsLapsBtn'),
    lapModal:  document.getElementById('fsLapsModal'),
    lapList:   document.getElementById('fsLapsModalList'),
    lapCancel: document.getElementById('fsLapsCancelBtn'),
    resetBtn:  document.getElementById('fsResetBtn'),
    saveBtn:   document.getElementById('fsSaveBtn'),
    exitBtn:   document.getElementById('fsExitBtn'),
    display:   document.getElementById('fsDisplayArea'),
    modeSel:   document.getElementById('fsModeSelection'),
  };
  const missing = Object.entries(E).filter(([,v]) => !v).map(([k]) => k);
  if (missing.length) console.warn('Stoper: brakujące elementy DOM:', missing.join(', '));
}

/* ═══════════════════════════════════════════════════════
   FORMAT CZASU mm:ss.cc
═══════════════════════════════════════════════════════ */
function fmt(ms) {
  const m  = Math.floor(ms / 60000);
  const s  = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${p2(m)}:${p2(s)}.${p2(cs)}`;
}
const p2 = n => n < 10 ? '0' + n : '' + n;

/* ═══════════════════════════════════════════════════════
   RAF TICK — renderowanie czasu (requestAnimationFrame)
   Używamy rAF zamiast setInterval dla lepszej płynności
   i braku driftu na urządzeniach mobilnych
═══════════════════════════════════════════════════════ */
function rafTick(ts) {
  if (!_running) return;
  _elapsed = Date.now() - _startTs;
  _renderTime();
  _rafId = requestAnimationFrame(rafTick);
}

function _renderTime() {
  if (!E.time) return;
  if (_mode === 'reps') {
    E.time.innerHTML =
      `<span class="fs-time-main">${fmt(_elapsed)}</span>` +
      `<span class="fs-rep-counter" id="fsRepNum">${_reps}</span>`;
  } else {
    E.time.textContent = fmt(_elapsed);
  }
}

/* ═══════════════════════════════════════════════════════
   RESET — czyści wszystko do stanu wyboru trybu
═══════════════════════════════════════════════════════ */
function _reset() {
  cancelAnimationFrame(_rafId);
  _running = false; _elapsed = 0; _reps = 0; _laps = []; _mode = null;

  if (E.time)     E.time.innerHTML  = '00:00.00';
  if (E.startBtn) { E.startBtn.style.display = 'none'; E.startBtn.innerHTML = '▶ START'; E.startBtn.classList.remove('stop-state'); }
  if (E.postStop) E.postStop.style.display = 'none';
  if (E.modeSel)  E.modeSel.style.display  = 'grid';
  if (E.repsBtn)  E.repsBtn.classList.remove('selected');
  if (E.lapsBtn)  E.lapsBtn.classList.remove('selected');
  if (E.root)     E.root.classList.remove('mode-selected','sw-running','sw-stopped');
  _removeTapHint();
  _removeEventIcon();
}

/* ═══════════════════════════════════════════════════════
   WYBÓR TRYBU — kluczowy punkt odblokowania audio na iOS
═══════════════════════════════════════════════════════ */
function _chooseMode(mode) {
  if (_running) return;
  // KRYTYCZNE: unlockAudio() tutaj — to jest obsługa user gesture
  unlockAudio();

  _mode = mode;
  E.root.classList.add('mode-selected');
  E.repsBtn.classList.toggle('selected', mode === 'reps');
  E.lapsBtn.classList.toggle('selected', mode === 'laps');

  E.startBtn.style.display = 'flex';
  E.startBtn.innerHTML = mode === 'reps'
    ? '<span style="display:block;font-size:0.45em;opacity:0.85;letter-spacing:1px;">LICZY CZAS + POWT.</span>▶ START'
    : '▶ START';
  E.startBtn.classList.remove('stop-state');
}

/* ═══════════════════════════════════════════════════════
   START
═══════════════════════════════════════════════════════ */
function _start() {
  if (_running) return;
  if (!_mode) { signalWarning(); VIB.warning(); notify('Wybierz tryb: Powtórzenia lub Międzyczasy', 'error'); return; }

  _running  = true;
  _startTs  = Date.now() - _elapsed;
  _rafId    = requestAnimationFrame(rafTick);

  signalStart(); VIB.start();
  _flash('#16A34A');

  E.root.classList.add('sw-running');
  E.root.classList.remove('sw-stopped');
  E.startBtn.classList.add('stop-state');
  E.startBtn.innerHTML = _mode === 'reps'
    ? '<span style="display:block;font-size:0.4em;opacity:0.8;">DOTKNIJ EKRAN = POWT.</span>⏹ STOP'
    : '⏹ STOP';

  _showTapHint();
}

/* ═══════════════════════════════════════════════════════
   STOP
═══════════════════════════════════════════════════════ */
function _stop() {
  if (!_running) return;
  _running = false;
  cancelAnimationFrame(_rafId);
  _elapsed = Date.now() - _startTs;
  _renderTime();

  signalStop(); VIB.stop();
  _flash('#FF4500');

  E.root.classList.remove('sw-running');
  E.root.classList.add('sw-stopped');
  E.startBtn.style.display = 'none';
  E.postStop.style.display = 'grid';
  _removeTapHint();

  if (_mode === 'laps' && _laps.length > 0) _showLapModal();
}

/* ═══════════════════════════════════════════════════════
   AKCJA DOTKNIĘCIA (rep / lap) — wywoływana przy każdym tapie
═══════════════════════════════════════════════════════ */
function _tap() {
  if (!_running) return;

  if (_mode === 'reps') {
    _reps++;
    signalRep(); VIB.rep();
    // Animacja licznika
    const rd = document.getElementById('fsRepNum');
    if (rd) { rd.classList.remove('rep-bounce'); void rd.offsetWidth; rd.classList.add('rep-bounce'); }
    // Krótka informacja na przycisku STOP
    const prev = E.startBtn.innerHTML;
    E.startBtn.innerHTML =
      `<span style="display:block;font-size:1.4em;font-weight:900;line-height:1;">${_reps}</span>` +
      `<span style="display:block;font-size:0.4em;opacity:0.8;">POWTÓRZEŃ / DOTKNIJ</span>`;

  } else if (_mode === 'laps') {
    const t = _elapsed;
    const prev = _laps.length > 0 ? _laps[_laps.length - 1] : 0;
    _laps.push(t);
    const seg = t - prev;
    signalLap(); VIB.lap();
    notify(`🔔 Międzyczas ${_laps.length}: ${fmt(t)} (+${fmt(seg)})`, 'info', 2000);
    E.startBtn.innerHTML = `<span style="font-size:0.8em;">+${fmt(seg)}</span>`;
    setTimeout(() => { if (_running) E.startBtn.innerHTML = '⏹ STOP'; }, 1400);
  }
}

/* ═══════════════════════════════════════════════════════
   FLASH NAKŁADKI KOLOROWEJ
═══════════════════════════════════════════════════════ */
function _flash(color) {
  if (!E.root) return;
  const div = document.createElement('div');
  div.className = 'sw-flash-overlay';
  div.style.cssText = `background:${color};`;
  E.root.appendChild(div);
  // Wymuszamy reflow przed dodaniem klasy animacji
  void div.offsetWidth;
  div.classList.add('sw-flash-active');
  setTimeout(() => div.remove(), 500);
}

/* ═══════════════════════════════════════════════════════
   WSKAZÓWKA DOTKNIĘCIA
═══════════════════════════════════════════════════════ */
function _showTapHint() {
  _removeTapHint();
  const el = document.createElement('div');
  el.id = 'swTapHint';
  el.className = 'sw-tap-hint';
  el.textContent = _mode === 'reps' ? '👆 Dotknij ekran = POWTÓRZENIE' : '👆 Dotknij ekran = MIĘDZYCZAS';
  E.root.appendChild(el);
}
function _removeTapHint() {
  document.getElementById('swTapHint')?.remove();
}

/* ═══════════════════════════════════════════════════════
   GRAFIKA KONKURENCJI
═══════════════════════════════════════════════════════ */
function _renderEventIcon(name) {
  _removeEventIcon();
  const v = getEventVisual(name);
  const el = document.createElement('div');
  el.id = 'fsEventVisual';
  el.className = 'sw-event-visual';
  el.style.cssText = `background:${v.bg};border-color:${v.color}55;`;
  el.innerHTML =
    `<span class="sw-ev-emoji" style="filter:drop-shadow(0 3px 10px ${v.color});">${v.e}</span>` +
    `<span class="sw-ev-name" style="color:${v.color};text-shadow:0 0 10px ${v.color};">${name||'Stoper'}</span>`;
  E.display.prepend(el);
  E.root.style.setProperty('--sw-accent', v.color);
}
function _removeEventIcon() {
  document.getElementById('fsEventVisual')?.remove();
}

/* ═══════════════════════════════════════════════════════
   MODAL WYBORU MIĘDZYCZASÓW
═══════════════════════════════════════════════════════ */
function _showLapModal() {
  if (!E.lapList) return;
  E.lapList.innerHTML = '';
  _laps.forEach((t, i) => {
    const prev = i > 0 ? _laps[i-1] : 0;
    const seg  = t - prev;
    const row = document.createElement('div');
    row.className = 'lap-item';
    row.innerHTML =
      `<strong style="min-width:22px;color:var(--gold-btn);">${i+1}.</strong>` +
      `<span style="font-size:1.1rem;font-weight:800;">${fmt(t)}</span>` +
      `<span style="font-size:0.82rem;opacity:0.62;">(+${fmt(seg)})</span>`;
    row.style.cssText = 'display:flex;align-items:center;gap:12px;';
    row.onclick = () => { _saveResult(t); E.lapModal.classList.remove('visible'); };
    E.lapList.appendChild(row);
  });
  E.lapModal.classList.add('visible');
}

/* ═══════════════════════════════════════════════════════
   ZAPIS WYNIKU
═══════════════════════════════════════════════════════ */
function _saveResult(overrideMs = null) {
  signalSave(); VIB.save();
  if (_onSave) {
    let result, eventType;
    if (_mode === 'reps') {
      result = _reps; eventType = 'high';
    } else {
      const ms = overrideMs !== null ? overrideMs : _elapsed;
      result = (ms / 1000).toFixed(2); eventType = 'low';
    }
    _onSave(_compName, result, eventType);
  }
  _exit();
}

/* ═══════════════════════════════════════════════════════
   WYJŚCIE ZE STOPERA
═══════════════════════════════════════════════════════ */
function _exit() {
  cancelAnimationFrame(_rafId);
  _running = false;
  if (E.root) E.root.classList.remove('visible');
  _removeTapHint();
  _removeEventIcon();
}

/* ═══════════════════════════════════════════════════════
   PUBLICZNE API
═══════════════════════════════════════════════════════ */

/** Otwiera stoper dla zawodnika. Wywoływany przez main.js. */
export function enterStopwatch(competitorName, saveCallback, eventName = '') {
  _onSave     = saveCallback;
  _compName   = competitorName;
  _eventName  = eventName;

  _reset();

  // Zawodnik
  const profile = getCompetitorProfile(competitorName) || {};
  if (E.name)  E.name.textContent = competitorName;
  if (E.photo) E.photo.src = profile.photo
    || `https://placehold.co/100x100/1E3A5F/fff?text=${encodeURIComponent((competitorName||'?').charAt(0))}`;

  // Grafika konkurencji
  _renderEventIcon(eventName);

  // Odblokuj audio — jesteśmy w obsłudze user gesture
  unlockAudio();

  if (E.root) E.root.classList.add('visible');
  // Fullscreen tylko na urządzeniach które to wspierają (nie iOS PWA)
  if (document.fullscreenEnabled && !navigator.standalone) {
    E.root.requestFullscreen?.().catch(() => {});
  }
}

/** Rejestruje wszystkie listenery. Wywołuj PO initStopwatch(). */
export function setupStopwatchEventListeners() {
  if (!E.root) { console.warn('SW: brak root — initStopwatch() nie został wywołany'); return; }

  /* ─── Wybór trybu ─── */
  E.repsBtn.addEventListener('click', () => _chooseMode('reps'));
  E.lapsBtn.addEventListener('click', () => _chooseMode('laps'));

  /* ─── Przycisk START/STOP ─── */
  E.startBtn.addEventListener('click', e => {
    e.stopPropagation();
    _running ? _stop() : _start();
  });

  /* ─── Post-stop ─── */
  E.resetBtn.addEventListener('click', _reset);
  E.saveBtn.addEventListener('click',  () => _saveResult(_elapsed));

  /* ─── Wyjście ─── */
  E.exitBtn.addEventListener('click', e => { e.preventDefault(); _exit(); });

  /* ─── Modal laps — anuluj ─── */
  E.lapCancel?.addEventListener('click', () => E.lapModal.classList.remove('visible'));

  /* ─── TAP na obszarze wyświetlacza (rep / lap) ───
     Strategia: jeden handler 'pointerup' obsługuje zarówno touch jak i mouse.
     Sprawdzamy czy event nie pochodzi z przycisków sterujących.
  ─── */
  E.display.addEventListener('pointerup', e => {
    if (!_running) return;
    // Ignoruj jeśli cel to przycisk lub jego dziecko
    const skip = [E.startBtn, E.photo, E.name, E.repsBtn, E.lapsBtn, E.resetBtn, E.saveBtn];
    if (skip.some(el => el && (el === e.target || el.contains(e.target)))) return;
    // Ignoruj jeśli duże przesunięcie (scroll na mobile)
    if (e.pointerType === 'touch' && Math.hypot(e.movementX, e.movementY) > 12) return;
    _tap();
  });

  /* ─── Fullscreen change — zamknij gdy opuszczono fullscreen ─── */
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && E.root?.classList.contains('visible')) _exit();
  });
}
