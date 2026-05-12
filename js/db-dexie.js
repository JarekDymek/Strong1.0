/* db-dexie.js - IndexedDB/Dexie repository for competitors. */
import Dexie from 'https://cdn.jsdelivr.net/npm/dexie@3.2.2/dist/dexie.mjs';
import { showNotification } from './ui.js';
import { INITIAL_COMPETITORS } from './initialData.js';

const DB_NAME = 'StrongmanDB_v12_Competitors';
const DB_VERSION = 3;

const db = new Dexie(DB_NAME);
db.version(DB_VERSION).stores({
  competitors: '++id, name',
  events: '++id, name, type'
});

export function dbAction(dbInstance, storeName, mode, action, data) {
  // For compatibility; action receives Dexie table instead of IDBObjectStore
  return new Promise(async (resolve, reject) => {
    try {
      if (!db) return reject('Baza danych nie jest zainicjowana.');
      const table = db.table(storeName);
      const result = await action(table, data);
      resolve(result);
    } catch (err) {
      reject(err);
    }
  });
}

export async function initDB() {
  // BUG-11 fix: seed is called by main.js after initDB — not here to avoid double call
  await db.open();
  return db;
}

export async function getCompetitors() {
  const all = await db.table('competitors').toArray();
  return all.sort((a,b) => (a.name||'').localeCompare(b.name||'', 'pl'));
}

export async function getCompetitorById(id) {
  return await db.table('competitors').get(Number(id));
}

export async function saveCompetitor(competitorData) {
  if (competitorData.id) {
    const id = Number(competitorData.id);
    await db.table('competitors').update(id, competitorData);
    return id;
  } else {
    const newId = await db.table('competitors').add(competitorData);
    return newId;
  }
}

export async function deleteCompetitor(id) {
  await db.table('competitors').delete(Number(id));
  return true;
}

export async function seedCompetitorsDatabaseIfNeeded() {
  const count = await db.table('competitors').count();
  if (count === 0 && Array.isArray(INITIAL_COMPETITORS) && INITIAL_COMPETITORS.length) {
    await db.table('competitors').bulkAdd(INITIAL_COMPETITORS.map(c => ({...c})));
    showNotification('Wczytano początkową listę zawodników', 'info');
  }
}

export async function toBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = e => reject(e);
    reader.readAsDataURL(file);
  });
}

/**
 * Konwertuje dowolny plik obrazu na JFIF (JPEG) 120×120 px.
 * Crop do kwadratu ze środka obrazu, skalowanie do 120×120, białe tło.
 * Zwraca data URL "data:image/jpeg;base64,..."
 * Używane przy zapisie zdjęcia zawodnika — redukuje rozmiar bazy ~10-20x.
 */
export function toJfif120(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        // Crop do kwadratu (środek obrazu)
        const size = Math.min(img.width, img.height);
        const sx   = Math.floor((img.width  - size) / 2);
        const sy   = Math.floor((img.height - size) / 2);

        const canvas  = document.createElement('canvas');
        canvas.width  = 120;
        canvas.height = 120;
        const ctx = canvas.getContext('2d');

        // Białe tło (obsługa PNG z przezroczystością)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 120, 120);

        // Narysuj przycięty i przeskalowany obraz
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 120, 120);

        // Eksportuj jako JPEG/JFIF, jakość 0.88 — dobry kompromis jakość/rozmiar
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function importCompetitorsFromJson(jsonData) {
  if (!Array.isArray(jsonData) || jsonData.length === 0)
    throw new Error('Nieprawidłowy lub pusty plik JSON — oczekiwana tablica zawodników.');

  const existing      = await db.table('competitors').toArray();
  const existingByName = new Map(existing.map(c => [(c.name || '').toLowerCase(), c]));
  let added = 0, updated = 0;

  for (const raw of jsonData) {
    if (!raw || typeof raw !== 'object' || !raw.name) continue;

    // Usuń id z importowanego rekordu — Dexie sam nada nowy klucz (++id)
    const { id: _dropped, ...comp } = raw;
    const key = (comp.name || '').toLowerCase();
    const existing = existingByName.get(key);

    if (existing) {
      // Aktualizuj istniejącego (zachowaj jego id z bazy)
      await db.table('competitors').update(existing.id, comp);
      updated++;
    } else {
      await db.table('competitors').add(comp);
      added++;
    }
  }

  showNotification(`Import zawodników: dodano ${added}, zaktualizowano ${updated}.`, 'success');
  return { added, updated };
}

export async function exportCompetitorsToJson() {
  const competitors = await getCompetitors();
  const dataStr = JSON.stringify(competitors, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'strongman_baza_zawodnikow.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showNotification('Baza zawodników wyeksportowana.', 'success');
}
