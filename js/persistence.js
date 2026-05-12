
// Plik: js/persistence.js (Zmieniona wersja - async IndexedDB autosave z opcją wyłączenia)
// Cel: Zarządza utrwalaniem stanu i eksportami. Autosave przeniesiony z localStorage do IndexedDB,
// co zapobiega blokowaniu głównego wątku. Dodano opcję włączenia/wyłączenia autosave.

import { getState, restoreState, resetState } from './state.js';
import { showNotification, showConfirmation, showPrompt, DOMElements, renderFinalSummary } from './ui.js';
import { clearHistory } from './history.js';
import * as CheckpointsDB from './checkpointsDb.js';

const AUTO_SAVE_DB_KEY = 'strongman_autoSave_v1';
const AUTO_SAVE_PREF_KEY = 'strongman_autosave_enabled_v1';
const THEME_KEY = 'strongmanTheme_v12';

let autoSaveTimer = null;
let autosaveEnabled = true;
const AUTOSAVE_DELAY = 1000; // ms debounce

// --- IndexedDB helper (very small key-value store) ---
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('strongman-db', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function idbPut(key, value) {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite');
    const store = tx.objectStore('kv');
    const req = store.put(value, key);
    req.onsuccess = () => res(true);
    req.onerror = (e) => rej(e.target.error);
  });
}

async function idbGet(key) {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readonly');
    const store = tx.objectStore('kv');
    const req = store.get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = (e) => rej(e.target.error);
  });
}

async function idbDelete(key) {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite');
    const store = tx.objectStore('kv');
    const req = store.delete(key);
    req.onsuccess = () => res(true);
    req.onerror = (e) => rej(e.target.error);
  });
}

// Theme helpers (unchanged)
export function saveTheme(themeName) { localStorage.setItem(THEME_KEY, themeName); }
export function loadTheme() { return localStorage.getItem(THEME_KEY) || 'light'; }

// --- Autosave preference ---
export function setAutosaveEnabled(flag) {
  autosaveEnabled = !!flag;
  try { localStorage.setItem(AUTO_SAVE_PREF_KEY, JSON.stringify(autosaveEnabled)); } catch(e) {}
}
export function isAutosaveEnabled() {
  try {
    const raw = localStorage.getItem(AUTO_SAVE_PREF_KEY);
    if (raw === null) return true;
    autosaveEnabled = JSON.parse(raw);
    return autosaveEnabled;
  } catch(e) { return true; }
}

// --- Autosave: debounce + async IDB save ---
let autosaveSuspended = false;

export function suspendAutosave() { autosaveSuspended = true; }
export function resumeAutosave() { autosaveSuspended = false; }

export function triggerAutoSave() {
    if (!isAutosaveEnabled()) return;
    if (autosaveSuspended) return;   // BUG-05 fix: suspended flag was never checked
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
        try {
            const stateObj = getState();
            await idbPut(AUTO_SAVE_DB_KEY, stateObj);
            const indicator = document.getElementById('saveIndicator');
            if (indicator) {
              indicator.classList.add('visible');
              setTimeout(() => indicator.classList.remove('visible'), 1200);
            }
        } catch (e) {
            console.error('Async autosave failed', e);
            showNotification("Błąd auto-zapisu (IDB).", "error");
        } finally {
            autoSaveTimer = null;
        }
    }, AUTOSAVE_DELAY);
}

/**
 * Zapisuje autosave (IDB, nadpisywany) ORAZ osobny nazwany checkpoint
 * z opisem kontekstowym — np. "Po losowaniu", "Po Konkurencji 2 – Atlas Stones".
 * Wywoływany w kluczowych momentach zamiast zwykłego triggerAutoSave().
 *
 * @param {string} label - Opisowa nazwa punktu kontrolnego
 */
export function triggerAutoSaveWithContext(label) {
    triggerAutoSave();   // zawsze też zwykły autosave (nadpisywany)
    if (!isAutosaveEnabled()) return;
    // Zapis checkpointu z opóźnieniem AUTOSAVE_DELAY + 200ms,
    // żeby stan zdążył się ustabilizować przed snapshootem
    setTimeout(async () => {
        try {
            const st = getState();
            // BUG-10 fix: use shared sanitizeForIDB from utils.js instead of inline duplicate
            const { sanitizeForIDB } = await import('./utils.js');
            const record = {
                name: label,
                state: sanitizeForIDB(st) || {},
                timestamp: Date.now(),
                auto: true
            };
            await CheckpointsDB.saveCheckpoint(record);
        } catch (e) {
            console.warn('triggerAutoSaveWithContext: checkpoint error', e);
        }
    }, AUTOSAVE_DELAY + 200);
}

// Load state from async IDB autosave (called at startup)
export async function loadStateFromAutoSave() {
    try {
        const loaded = await idbGet(AUTO_SAVE_DB_KEY);
        if (!loaded) return false;
        if (await showConfirmation("Wykryto niezakończoną sesję. Czy chcesz ją przywrócić?")) {
            restoreState(loaded);
            showNotification("Sesja została przywrócona!", "success");
            return true;
        } else {
            // user declined -> remove autosave
            await idbDelete(AUTO_SAVE_DB_KEY);
            return false;
        }
    } catch (e) {
        console.error('Failed to load autosave from IDB', e);
        return false;
    }
}

export async function clearAutoSave() {
  try { await idbDelete(AUTO_SAVE_DB_KEY); } catch(e) { console.warn('clearAutoSave failed', e); }
}

// --- Checkpoints (existing code expects CheckpointsDB usage) ---
// Forwarding to existing CheckpointsDB
export async function getCheckpoints() {
  return CheckpointsDB.getCheckpointsDB();
}
export async function deleteCheckpoint(key) {
  return CheckpointsDB.deleteCheckpoint(key);
}

// --- Import / Export functions (keep original behavior but use IDB where appropriate) ---
export async function exportStateToFile(contextLabel) {
    const data = getState();
    // Buduj opisową nazwę pliku
    const eventName  = (data.eventName || 'Zawody').replace(/[\s\/\\:*?"<>|]/g, '_').slice(0, 30);
    const eventNum   = data.eventNumber || 1;
    const eventTitle = (data.eventTitle || '').replace(/[\s\/\\:*?"<>|]/g, '_').slice(0, 25);
    const dateStr    = new Date().toLocaleDateString('pl-PL').replace(/\./g, '-');
    let label        = contextLabel || `Konk_${eventNum}_${eventTitle}` || 'stan';
    label = label.replace(/[\s\/\\:*?"<>|–—]/g, '_').slice(0, 50);
    const filename   = `${eventName}_${label}_${dateStr}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export async function importStateFromFile(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (!importedData.competitors || !importedData.eventHistory) {
                    throw new Error("Plik nie wygląda na prawidłowy plik stanu aplikacji.");
                }
                if (await showConfirmation("Czy na pewno chcesz zaimportować stan z pliku? Spowoduje to nadpisanie bieżącej sesji.")) {
                    restoreState(importedData);
                    clearHistory();
                    showNotification("Stan pomyślnie zaimportowano!", "success");
                    resolve(true);
                } else resolve(false);
            } catch(err) {
                console.error(err);
                showNotification("Błąd przy imporcie pliku.", "error");
                resolve(false);
            }
        };
        reader.readAsText(file);
    });
}

// --- Checkpoints UI & Handlers (added) ---
/*
  Functions:
   - saveCheckpoint(eventOrName): saves current state or named checkpoint
   - handleShowCheckpoints(): fetches checkpoints and displays them in the UI
   - handleCheckpointListActions(e, refreshFullUI): handles click actions in the checkpoint list (load/delete)
   - resetApplication(): resets app state and UI
*/
export async function saveCheckpoint(eventOrName) {
    try {
        // accept either (string name) or nothing — prompt for name
        let name = (typeof eventOrName === 'string' && eventOrName.trim()) ? eventOrName.trim() : null;
        if (!name) {
            const defaultName = 'Ręczny ' + new Date().toLocaleString('pl-PL');
            name = await showPrompt('Podaj nazwę punktu kontrolnego:', defaultName);
            if (!name) return; // user cancelled
        }
        const st = getState();
        // sanitize state to avoid DataCloneError
        function sanitize(obj, _seen = new WeakSet()) {
            if (obj === null || obj === undefined) return obj;
            if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') return obj;
            if (typeof obj === 'function') return undefined;
            if (typeof obj === 'object') {
                if (_seen.has(obj)) return undefined;
                _seen.add(obj);
                // skip DOM Nodes, Events, Window
                if (typeof Node !== 'undefined' && obj instanceof Node) return undefined;
                if (typeof Event !== 'undefined' && obj instanceof Event) return undefined;
                if (typeof Window !== 'undefined' && obj instanceof Window) return undefined;
                if (Array.isArray(obj)) {
                    return obj.map(i => sanitize(i, _seen)).filter(i => i !== undefined);
                }
                const out = {};
                for (const k of Object.keys(obj)) {
                    try {
                        const v = obj[k];
                        if (typeof v === 'function') continue;
                        if (v && typeof v === 'object' && (v.nodeType || v instanceof Event || (typeof Window !== "undefined" && v instanceof Window))) continue;
                        const sv = sanitize(v, _seen);
                        if (sv !== undefined) out[k] = sv;
                    } catch (e) {
                        continue;
                    }
                }
                return out;
            }
            return undefined;
        }
        const record = {
            name: name || ('Checkpoint ' + new Date().toISOString()),
            state: sanitize(st) || {},
            timestamp: Date.now()
        };
        await CheckpointsDB.saveCheckpoint(record);
        showNotification('Punkt kontrolny zapisany.', 'success');
    } catch (err) {
        console.error('saveCheckpoint error', err);
        showNotification('Błąd zapisu punktu kontrolnego.', 'error');
        throw err;
    }
}

export async function handleShowCheckpoints(containerId, listId) {
    try {
        const cps = await getCheckpoints();
        // Obsługa zarówno domyślnego panelu jak i dodatkowych (np. intro)
        const list = listId
            ? document.getElementById(listId)
            : DOMElements.checkpointList;
        const container = containerId
            ? document.getElementById(containerId)
            : DOMElements.checkpointListContainer;
        if (!list || !container) {
            showNotification('Interfejs punktów kontrolnych nie znaleziony.', 'error');
            return;
        }
        list.innerHTML = cps.map(cp => {
            const when  = cp.timestamp ? (new Date(cp.timestamp)).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
            const day   = cp.timestamp ? (new Date(cp.timestamp)).toLocaleDateString('pl-PL') : '';
            const isAuto = cp.auto === true;
            // Ikona: auto-checkpoint = 🔄, ręczny = 📌
            const icon  = isAuto ? '🔄' : '📌';
            const badge = isAuto
                ? `<span style="font-size:0.72rem;background:#2980b9;color:#fff;padding:2px 7px;border-radius:10px;margin-left:6px;white-space:nowrap;">auto</span>`
                : `<span style="font-size:0.72rem;background:#27ae60;color:#fff;padding:2px 7px;border-radius:10px;margin-left:6px;white-space:nowrap;">ręczny</span>`;
            const label = cp.name || 'Bez nazwy';
            return `<li class="checkpoint-item" data-key="${cp.key}" style="display:flex;justify-content:space-between;align-items:center;padding:8px 6px;border-bottom:1px solid #eee;gap:8px;">
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:600;font-size:0.95rem;white-space:normal;line-height:1.3;">${icon} ${label}${badge}</div>
                  <div style="font-size:0.78rem;color:#888;margin-top:2px;">${day} ${when}</div>
                </div>
                <div style="display:flex;gap:6px;flex-shrink:0;">
                  <button data-action="load" data-key="${cp.key}" class="btn small" style="padding:6px 12px;font-size:0.85rem;">Wczytaj</button>
                  <button data-action="delete" data-key="${cp.key}" class="btn small danger" style="padding:6px 12px;font-size:0.85rem;">Usuń</button>
                </div>
            </li>`;
        }).join('');
        container.classList.add('visible');
    } catch (err) {
        console.error('handleShowCheckpoints error', err);
        showNotification('Błąd podczas pobierania punktów kontrolnych.', 'error');
    }
}

export async function handleCheckpointListActions(e, refreshFullUI, containerId, listId) {
    try {
        const btn = e.target.closest('button');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const key = btn.getAttribute('data-key');
        if (!action || !key) return;
        if (action === 'delete') {
            if (!await showConfirmation('Na pewno usunąć punkt kontrolny?')) return;
            await deleteCheckpoint(key);
            showNotification('Usunięto punkt kontrolny.', 'success');
            // Odśwież listę w miejscu zamiast przeładowywać całe UI
            await handleShowCheckpoints(containerId, listId);
            return;
        }
        if (action === 'load') {
            // fetch all checkpoints and find key
            const cps = await getCheckpoints();
            const cp = cps.find(c => (c.key == key || c.key === key));
            if (!cp) {
                showNotification('Nie znaleziono punktu kontrolnego.', 'error');
                return;
            }
            // restore sanitized state
            try {
                if (!await showConfirmation(`Wczytać punkt "${cp.name}"? Bieżący stan zawodów zostanie nadpisany.`)) return;
                restoreState(cp.state);
                clearHistory();
                // Ukryj listę po wczytaniu
                const container = document.getElementById('checkpointListContainer');
                if (container) container.classList.remove('visible');
                showNotification(`Wczytano: ${cp.name}`, 'success');
                if (typeof refreshFullUI === 'function') refreshFullUI();
            } catch (e) {
                console.error('restore checkpoint failed', e);
                showNotification('Błąd przy wczytywaniu punktu kontrolnego.', 'error');
            }
            return;
        }
    } catch (err) {
        console.error('handleCheckpointListActions error', err);
        showNotification('Błąd akcji na liście punktów kontrolnych.', 'error');
    }
}

export async function resetApplication(refreshCallback) {
    try {
        if (!await showConfirmation('Czy na pewno zresetować aplikację? Wszystkie dane bieżących zawodów zostaną utracone.')) return;
        await clearAutoSave();
        resetState();
        clearHistory();
        // Wyczyść tokeny sędziów pomocniczych
        try {
            const { resetSession } = await import('./judge.js');
            resetSession();
        } catch(_) {}
        showNotification('Aplikacja zresetowana.', 'info');
        if (typeof refreshCallback === 'function') refreshCallback();
    } catch (err) {
        console.error('resetApplication error', err);
        showNotification('Błąd resetu aplikacji.', 'error');
    }
}
// --- Existing persistence logic (if any) should remain above ---
