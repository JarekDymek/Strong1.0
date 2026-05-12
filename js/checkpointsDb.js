// Plik: js/checkpointsDb.js
import { sanitizeForIDB } from './utils.js';
// Cel: Zarządza bazą danych IndexedDB dla punktów kontrolnych.

// Używamy natywnego IDB bezpośrednio – checkpointsDb to osobna baza,
// niezależna od bazy Dexie (StrongmanDB_v12_Competitors).

const DB_NAME    = 'StrongmanCheckpointsDB';
const STORE_NAME = 'checkpoints';
const DB_VERSION = 1;

let checkpointsDb = null;

/** Zwraca otwartą instancję bazy — lazy init z auto-recovery po zamknięciu. */
function getDB() {
    // Jeśli baza jest otwarta i NIE jest w trakcie zamykania, zwróć ją
    if (checkpointsDb && !checkpointsDb._closed) {
        return Promise.resolve(checkpointsDb);
    }
    // Reset — wymuś ponowne otwarcie
    checkpointsDb = null;
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = e => reject(e.target.error);
        req.onsuccess = e => {
            const db = e.target.result;
            // Nasłuchuj na nieoczekiwane zamknięcie (np. przez przeglądarkę)
            db.onclose = () => {
                console.warn('CheckpointsDB: połączenie zamknięte przez przeglądarkę — zostanie wznowione przy następnej operacji.');
                checkpointsDb = null;
            };
            db.onversionchange = () => {
                db.close();
                checkpointsDb = null;
            };
            checkpointsDb = db;
            resolve(db);
        };
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            }
        };
        req.onblocked = () => {
            console.warn('CheckpointsDB: otwarcie zablokowane przez starszą wersję bazy.');
        };
    });
}

/**
 * Wykonuje operację IDB z automatycznym retry przy błędzie zamkniętej bazy.
 */
async function idbAction(storeName, mode, action, data) {
    // Próbuj do 2 razy (drugi raz po resecie połączenia)
    for (let attempt = 0; attempt < 2; attempt++) {
        let db;
        try {
            db = await getDB();
        } catch (err) {
            throw err;
        }
        try {
            const result = await new Promise((resolve, reject) => {
                const tx      = db.transaction(storeName, mode);
                const store   = tx.objectStore(storeName);
                const request = action(store, data);
                tx.onerror = e => reject(e.target.error);
                if (request) {
                    request.onerror   = e => reject(e.target.error);
                    request.onsuccess = e => resolve(e.target.result);
                } else {
                    tx.oncomplete = () => resolve(undefined);
                }
            });
            return result;
        } catch (err) {
            const isClosingError = err && (
                err.name === 'InvalidStateError' ||
                (err.message && err.message.includes('closing'))
            );
            if (isClosingError && attempt === 0) {
                // Baza się zamknęła — zresetuj i spróbuj ponownie
                console.warn('CheckpointsDB: baza zamknięta — ponawiam połączenie…');
                checkpointsDb = null;
                continue;
            }
            throw err;
        }
    }
}

export async function initCheckpointsDB() {
    await getDB();
}

export async function saveCheckpoint(obj) {
    const key = obj && obj.key ? obj.key : 'cp_' + Date.now();
    const record = { key, ...(obj || {}) };
    record.state = sanitizeForIDB(record.state) || {};
    return await idbAction(STORE_NAME, 'readwrite', (store, r) => store.put(r), record);
}

export async function deleteCheckpoint(key) {
    return await idbAction(STORE_NAME, 'readwrite', (store, k) => store.delete(k), key);
}

export async function getCheckpointsDB() {
    const checkpoints = await idbAction(STORE_NAME, 'readonly', store => store.getAll());
    return checkpoints.sort((a, b) => b.key.localeCompare(a.key));
}

export async function clearAllCheckpointsDB() {
    return await idbAction(STORE_NAME, 'readwrite', store => store.clear());
}
