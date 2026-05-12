// js/eventsDb.js - unified Dexie-backed events store
import { showNotification } from './ui.js';
import { INITIAL_EVENTS } from './initialData.js';
import { dbAction } from './db-dexie.js';

export async function getEvents() {
  return await dbAction(null, 'events', 'readonly', async (store) => {
    // Dexie table: use toArray
    return await store.toArray();
  });
}

export async function saveEvent(eventData) {
  // if id present, use put, else add
  return await dbAction(null, 'events', 'readwrite', (store, data) => {
    if (data.id !== undefined && data.id !== null) {
      return store.put(data);
    } else {
      return store.add(data);
    }
  }, eventData);
}

export async function addEvent(eventData) {
  return await dbAction(null, 'events', 'readwrite', (store, data) => store.add(data), eventData);
}

export async function deleteEvent(id) {
  return await dbAction(null, 'events', 'readwrite', (store, key) => store.delete(key), id);
}

export async function clearEventsDatabase() {
  await dbAction(null, 'events', 'readwrite', (store) => store.clear());
  showNotification('Baza konkurencji została wyczyszczona.', 'info', 3000);
}

export async function seedEventsDatabaseIfNeeded() {
  const events = await getEvents();
  if ((!events || events.length === 0) && INITIAL_EVENTS && INITIAL_EVENTS.length > 0) {
    showNotification('Wypełniam bazę początkowymi konkurencjami...', 'info', 4000);
    await Promise.all(INITIAL_EVENTS.map(e => saveEvent(e)));
    showNotification('Baza konkurencji wypełniona domyślnymi konkurencjami.', 'success', 2500);
  }
}

export async function importEventsFromJson(jsonArray) {
  if (!Array.isArray(jsonArray) || jsonArray.length === 0)
    throw new Error('Nieprawidłowy lub pusty plik — oczekiwana tablica konkurencji.');

  const currentEvents = await getEvents();
  const currentNames  = new Map(currentEvents.map(e => [
    (e.name || '').toLowerCase(), e
  ]));
  let added = 0, updated = 0;

  for (const raw of jsonArray) {
    if (!raw || typeof raw !== 'object' || !raw.name) continue;

    // Usuń id z pliku — Dexie nada własny klucz
    const { id: _dropped, ...ev } = raw;
    const key = (ev.name || '').toLowerCase();
    const existing = currentNames.get(key);

    if (existing) {
      // Aktualizuj: zachowaj id z bazy
      await saveEvent({ ...existing, ...ev });
      updated++;
    } else {
      await addEvent(ev);
      added++;
    }
  }

  showNotification(`Import konkurencji: dodano ${added}, zaktualizowano ${updated}.`, 'success');
  return { added, updated };
}

export async function exportEventsToJson() {
  const events = await getEvents();
  const dataStr = JSON.stringify(events, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'strongman_baza_konkurencji.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showNotification('Baza konkurencji wyeksportowana.', 'success');
}
