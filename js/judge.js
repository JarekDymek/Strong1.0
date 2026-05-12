// js/judge.js
// Moduł wielosędziowski — FIREBASE REALTIME DATABASE
//
// ARCHITEKTURA:
//
//   Tryb ONLINE (Firebase):
//     Sędzia Główny publikuje dane sesji do Firebase pod ścieżką:
//       /sessions/{sessionId}/judges/{token}   — dane tokenu
//     Sędzia Pomocniczy zapisuje wyniki do:
//       /sessions/{sessionId}/results/{token}/{competitorKey}
//     Sędzia Główny nasłuchuje przez onValue() — wyniki pojawiają
//     się natychmiast (real-time), bez pollingu.
//
//   Tryb OFFLINE (fallback localStorage):
//     Gdy Firebase jest niedostępny (brak sieci lub brak konfiguracji),
//     moduł automatycznie używa localStorage. Działa tylko między
//     zakładkami/oknami na tym samym urządzeniu.
//
//   Aplikacja sędziego głównego (index.html) działa w 100% offline.
//   Firebase obsługuje TYLKO kanał komunikacji z sędziami pomocniczymi.
//
// KONFIGURACJA:
//   Uzupełnij FIREBASE_CONFIG danymi z konsoli Firebase:
//   https://console.firebase.google.com → Twój projekt →
//   Ustawienia projektu → Twoje aplikacje → Konfiguracja SDK

// ─────────────────────────────────────────────────────────────
// KONFIGURACJA FIREBASE — UZUPEŁNIJ SWOIMI DANYMI
// ─────────────────────────────────────────────────────────────
export const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyAse1NPy31AUzct3fp9tnZqQEGdEwk38ek",
    authDomain:        "strongman-zawody.firebaseapp.com",
    databaseURL:       "https://strongman-zawody-default-rtdb.europe-west1.firebasedatabase.app",
    projectId:         "strongman-zawody",
    storageBucket:     "strongman-zawody.firebasestorage.app",
    messagingSenderId: "469924902322",
    appId:             "1:469924902322:web:d9ac88a1c2b65b157860ab",
    measurementId:     "G-14728F8658",
};

// ─────────────────────────────────────────────────────────────
// STAŁE LOKALNE (fallback)
// ─────────────────────────────────────────────────────────────
const LS_SESSION_KEY = 'strongman_judge_session';
const LS_RESULTS_PFX = 'strongman_judge_result_';
const LS_JUDGES_KEY  = 'strongman_judges';
const POLL_INTERVAL  = 2000;

// ─────────────────────────────────────────────────────────────
// STAN MODUŁU
// ─────────────────────────────────────────────────────────────
let sessionId    = null;
let firebaseDb   = null;
let firebaseMode = false;
let pollTimer    = null;
let fbListeners  = [];
let onResultCb   = null;

// ─────────────────────────────────────────────────────────────
// INICJALIZACJA FIREBASE
// ─────────────────────────────────────────────────────────────

function isFirebaseConfigured() {
    return FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith('WPISZ');
}

async function initFirebase() {
    if (firebaseMode) return true;
    if (!isFirebaseConfigured()) return false;
    try {
        const { initializeApp, getApps } = await import(
            'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'
        );
        const fbModule = await import(
            'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js'
        );
        const app = getApps().length > 0 ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
        firebaseDb = fbModule.getDatabase(app);
        firebaseDb._fn = {
            ref:     fbModule.ref,
            set:     fbModule.set,
            get:     fbModule.get,
            onValue: fbModule.onValue,
            remove:  fbModule.remove,
        };
        firebaseMode = true;
        console.log('[Judge] Firebase aktywny — tryb online');
        return true;
    } catch (err) {
        console.warn('[Judge] Firebase niedostępny, tryb localStorage:', err.message);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────
// SESJA
// ─────────────────────────────────────────────────────────────

export async function initSession() {
    sessionId = localStorage.getItem(LS_SESSION_KEY + '_id');
    if (!sessionId) {
        sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        localStorage.setItem(LS_SESSION_KEY + '_id', sessionId);
    }
    await initFirebase();
    return sessionId;
}

export function getSessionId() {
    return sessionId || localStorage.getItem(LS_SESSION_KEY + '_id') || '';
}

// ─────────────────────────────────────────────────────────────
// TOKENY SĘDZIÓW
// ─────────────────────────────────────────────────────────────

export async function createJudgeToken(label, assignedCompetitors) {
    const sid   = getSessionId() || await initSession();
    const token = 'j_' + Math.random().toString(36).slice(2, 9);
    const judges = getJudges();
    judges.push({ token, label, assignedCompetitors, active: true, createdAt: Date.now() });
    localStorage.setItem(LS_JUDGES_KEY, JSON.stringify(judges));
    await publishSessionData(assignedCompetitors, token, label, sid);
    return token;
}

export async function publishSessionData(competitors, token, label, sid) {
    const eventTitle = document.getElementById('eventTitle')?.textContent?.trim() || '';
    const eventType  = localStorage.getItem('strongman_current_event_type') || 'high';
    const data = {
        sid: sid || getSessionId(),
        token, label, competitors,
        eventTitle, eventType,
        ts: Date.now()
    };

    if (firebaseMode && firebaseDb) {
        try {
            const { ref, set } = firebaseDb._fn;
            await set(ref(firebaseDb, `sessions/${data.sid}/judges/${token}`), data);
            return;
        } catch (err) {
            console.warn('[Judge] publishSessionData Firebase error:', err.message);
        }
    }
    localStorage.setItem(LS_SESSION_KEY + '_' + token, JSON.stringify(data));
}

export async function refreshAllSessions(competitors, eventTitle, eventType) {
    const judges = getJudges();
    const sid    = getSessionId();
    for (const j of judges) {
        if (!j.active) continue;

        // Kluczowa logika: zachowaj przydzielonych zawodników ale w NOWEJ kolejności startowej.
        // competitors ma już aktualną kolejność po zmianie konkurencji.
        // Filtrujemy: bierzemy tylko tych z j.assignedCompetitors, ale sortujemy wg pozycji w competitors.
        let orderedCompetitors;
        if (j.assignedCompetitors && j.assignedCompetitors.length > 0) {
            // Zachowaj kolejność z głównej listy, ogranicz do przydzielonych
            const assignedSet = new Set(j.assignedCompetitors);
            orderedCompetitors = competitors.filter(name => assignedSet.has(name));
            // Jeśli filtrowanie dało pustą listę (np. zawodnicy z innym case) — użyj oryginalnej
            if (orderedCompetitors.length === 0) orderedCompetitors = j.assignedCompetitors;
        } else {
            orderedCompetitors = competitors; // brak filtra = wszyscy w nowej kolejności
        }

        const data = {
            sid, token: j.token, label: j.label,
            competitors: orderedCompetitors,
            eventTitle, eventType, ts: Date.now()
        };
        if (firebaseMode && firebaseDb) {
            try {
                const { ref, set } = firebaseDb._fn;
                await set(ref(firebaseDb, `sessions/${sid}/judges/${j.token}`), data);
                continue;
            } catch (err) {
                console.warn('[Judge] refreshAllSessions error:', err.message);
            }
        }
        const key = LS_SESSION_KEY + '_' + j.token;
        const existing = JSON.parse(localStorage.getItem(key) || '{}');
        localStorage.setItem(key, JSON.stringify({ ...existing, ...data }));
    }
}

export function getJudges() {
    try { return JSON.parse(localStorage.getItem(LS_JUDGES_KEY) || '[]'); }
    catch { return []; }
}

export async function revokeJudge(token) {
    const judges = getJudges().filter(j => j.token !== token);
    localStorage.setItem(LS_JUDGES_KEY, JSON.stringify(judges));
    if (firebaseMode && firebaseDb) {
        try {
            const sid = getSessionId();
            const { ref, remove } = firebaseDb._fn;
            await remove(ref(firebaseDb, `sessions/${sid}/judges/${token}`));
            await remove(ref(firebaseDb, `sessions/${sid}/results/${token}`));
        } catch (err) {
            console.warn('[Judge] revokeJudge error:', err.message);
        }
    }
    localStorage.removeItem(LS_SESSION_KEY + '_' + token);
}

export async function resetSession() {
    if (firebaseMode && firebaseDb) {
        try {
            const { ref, remove } = firebaseDb._fn;
            await remove(ref(firebaseDb, `sessions/${getSessionId()}`));
        } catch (err) {
            console.warn('[Judge] resetSession error:', err.message);
        }
    }
    getJudges().forEach(j => localStorage.removeItem(LS_SESSION_KEY + '_' + j.token));
    localStorage.removeItem(LS_JUDGES_KEY);
    localStorage.removeItem(LS_SESSION_KEY + '_id');
    sessionId = null;
    stopPolling();
}

// ─────────────────────────────────────────────────────────────
// NASŁUCHIWANIE WYNIKÓW — SĘDZIA GŁÓWNY
// ─────────────────────────────────────────────────────────────

export function startPolling(callback) {
    onResultCb = callback;
    stopPolling();
    if (firebaseMode && firebaseDb) {
        _startFirebaseListening();
    } else {
        pollTimer = setInterval(_pollLocalStorage, POLL_INTERVAL);
    }
}

export function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    fbListeners.forEach(u => { try { u(); } catch(_) {} });
    fbListeners = [];
}

function _startFirebaseListening() {
    const sid = getSessionId();
    if (!sid || !firebaseDb) return;
    const { ref, onValue, remove } = firebaseDb._fn;
    const resultsRef = ref(firebaseDb, `sessions/${sid}/results`);

    const unsub = onValue(resultsRef, (snapshot) => {
        if (!snapshot.exists()) return;
        const allResults = snapshot.val();
        const judges = getJudges();

        Object.entries(allResults).forEach(([token, byCompetitor]) => {
            const judge = judges.find(j => j.token === token);
            Object.entries(byCompetitor || {}).forEach(([key, data]) => {
                if (!data || !data.result) return;
                if (Date.now() - (data.ts || 0) > 60000) return;
                const name = data.name || key.replace(/_/g, ' ');
                if (onResultCb) onResultCb(name, data.result, judge?.label || 'Sędzia');
                // Usuń po odebraniu
                remove(ref(firebaseDb, `sessions/${sid}/results/${token}/${key}`))
                    .catch(() => {});
            });
        });
    }, (err) => {
        console.warn('[Judge] Firebase listener error, przełączam na polling:', err.message);
        stopPolling();
        pollTimer = setInterval(_pollLocalStorage, POLL_INTERVAL);
    });

    fbListeners.push(unsub);
}

function _pollLocalStorage() {
    getJudges().forEach(j => {
        if (!j.active) return;
        (j.assignedCompetitors || []).forEach(name => {
            const key = LS_RESULTS_PFX + j.token + '_' + name;
            const raw = localStorage.getItem(key);
            if (!raw) return;
            try {
                const data = JSON.parse(raw);
                if (Date.now() - data.ts > 30000) return;
                if (onResultCb) onResultCb(name, data.result, j.label);
                localStorage.removeItem(key);
            } catch { localStorage.removeItem(key); }
        });
    });
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

export function getJudgeURL(token) {
    const sid = getSessionId();
    const params = new URLSearchParams({ token, sid });
    return new URL('judge.html?' + params.toString(), location.href).href;
}

export function isOnlineMode() {
    return firebaseMode;
}
