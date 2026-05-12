// js/liveDisplay.js
// Moduł wyświetlania wyników na żywo.
//
// ARCHITEKTURA:
//   Sędzia główny (ta sama zakładka) → publishState() → BroadcastChannel + localStorage
//   Telebimy / telefony sędziów      → /live.html    → nasłuchuje BroadcastChannel + polling localStorage
//
// Nie wymaga serwera ani internetu — działa w sieci lokalnej Wi-Fi gdy urządzenia
// otworzą tę samą stronę (GitHub Pages lub lokalny serwer).
//
// Zabezpieczenie awaryjne:
//   Co 5 sekund stan jest zapisywany do localStorage ('strongman_live_state').
//   Telebimy pollują co 3 sekundy — nawet jeśli BroadcastChannel nie dotrze
//   (różne urządzenia), dane pojawią się przez polling localStorage.

import { getState } from './state.js';

const CHANNEL_NAME = 'strongman-live';
const LS_KEY       = 'strongman_live_state';
const LS_PING_KEY  = 'strongman_live_ping';

let channel = null;
let heartbeatTimer = null;

/** Inicjalizuj BroadcastChannel i heartbeat */
export function init() {
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            channel = new BroadcastChannel(CHANNEL_NAME);
        }
    } catch (e) {
        console.warn('BroadcastChannel not supported, falling back to localStorage polling.');
    }
    // Heartbeat co 5s — zapis do localStorage dla urządzeń bez BroadcastChannel
    heartbeatTimer = setInterval(() => {
        _writeToLS();
    }, 5000);
}

/** Publikuj aktualny stan (wywołaj po każdej zmianie wyników) */
export function publishState() {
    const payload = _buildPayload();
    _writeToLS(payload);
    try {
        if (channel) channel.postMessage(payload);
    } catch (e) {
        console.warn('BroadcastChannel postMessage failed', e);
    }
}

function _buildPayload() {
    const s = getState();
    return {
        ts:          Date.now(),
        eventName:   s.eventName    || 'Zawody Strongman',
        eventNum:    s.eventNumber  || 1,
        eventTitle:  s.eventTitle   || `Konkurencja ${s.eventNumber}`,
        competitors: s.competitors  || [],
        scores:      s.scores       || {},
        eventHistory: s.eventHistory || [],
        logoData:    s.logoData     || null,
    };
}

function _writeToLS(payload) {
    try {
        const p = payload || _buildPayload();
        localStorage.setItem(LS_KEY, JSON.stringify(p));
        localStorage.setItem(LS_PING_KEY, String(Date.now()));
    } catch (e) { /* quota exceeded — ignore */ }
}

/** Otwórz okno telebima w nowej zakładce */
export function openLiveWindow() {
    publishState(); // upewnij się że dane są świeże
    const url = new URL('live.html', location.href).href;
    window.open(url, 'strongman-live', 'width=1280,height=720,menubar=no,toolbar=no,status=no');
}

/** Wygeneruj URL do udostępnienia sędziom (tylko jeśli jesteśmy na serwerze) */
export function getLiveURL() {
    return new URL('live.html', location.href).href;
}
