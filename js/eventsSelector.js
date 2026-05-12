// js/eventsSelector.js
// Modal wyboru i ustalania kolejności konkurencji przed startem zawodów.
// Ostatnia zaznaczona pozycja automatycznie otrzymuje zasady Konkurencji Finałowej
// (kolejność startu: od najniższej sumy punktów do najwyższej — reverse=true).

import { getEvents } from './eventsDb.js';

// ---- stan modalu ----
let allEvents = [];          // pełna lista z bazy
let selectedIds = new Set(); // zaznaczone id
let orderedIds  = [];        // kolejność (tablica id w kolejności zaznaczenia)

// ---- helpers DOM ----
function getModal()   { return document.getElementById('selectEventsForCompetitionModal'); }
function getList()    { return document.getElementById('eventsSelectionList'); }
function getCounter() { return document.getElementById('eventsSelectedCount'); }

// ---- render listy ----
function renderList() {
    const list = getList();
    if (!list) return;
    list.innerHTML = '';

    allEvents.forEach(ev => {
        const isSelected = selectedIds.has(ev.id);
        const order      = orderedIds.indexOf(ev.id);
        const isFinal    = isSelected && order === orderedIds.length - 1 && orderedIds.length > 0;

        const row = document.createElement('div');
        row.className = 'event-select-row' +
            (isSelected ? ' selected' : '') +
            (isFinal    ? ' is-final'  : '');
        row.dataset.id = ev.id;

        // numer kolejności
        const badge = document.createElement('div');
        badge.className = 'event-order-badge' + (isFinal ? ' final-badge' : '');
        badge.textContent = isSelected ? (order + 1) : '';

        // nazwa
        const name = document.createElement('div');
        name.className = 'event-select-name';
        name.textContent = ev.name + (isFinal ? ' 🏆 FINAŁ' : '');

        // typ
        const type = document.createElement('div');
        type.className = 'event-select-type';
        type.textContent = ev.type === 'low' ? '⬇ Mniej=Lepiej' : '⬆ Więcej=Lepiej';

        // checkbox
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'event-select-checkbox';
        cb.checked = isSelected;
        cb.readOnly = true;

        row.appendChild(badge);
        row.appendChild(name);
        row.appendChild(type);
        row.appendChild(cb);

        row.addEventListener('click', () => toggleEvent(ev.id));
        list.appendChild(row);
    });

    // aktualizuj licznik
    const counter = getCounter();
    if (counter) counter.textContent = selectedIds.size;
}

function toggleEvent(id) {
    if (selectedIds.has(id)) {
        selectedIds.delete(id);
        orderedIds = orderedIds.filter(x => x !== id);
    } else {
        selectedIds.add(id);
        orderedIds.push(id);
    }
    renderList();
}

// ---- API publiczne ----

/** Otwiera modal z listą wszystkich konkurencji z bazy. */
export async function openEventsSelector() {
    allEvents    = await getEvents();
    selectedIds  = new Set();
    orderedIds   = [];
    renderList();
    const modal = getModal();
    if (modal) modal.classList.add('visible');
}

/** Zamyka modal. */
export function closeEventsSelector() {
    const modal = getModal();
    if (modal) modal.classList.remove('visible');
}

/**
 * Zwraca wybrane konkurencje w ustalonej kolejności.
 * Ostatnia otrzymuje flagę isFinal = true.
 * Format: [{ id, name, type, isFinal }, ...]
 */
export function getSelectedEventsOrdered() {
    return orderedIds.map((id, idx) => {
        const ev     = allEvents.find(e => e.id === id);
        const isFinal = idx === orderedIds.length - 1;
        return { ...ev, isFinal };
    });
}

/** Zaznacz wszystkie w kolejności z bazy. */
export function selectAll() {
    selectedIds = new Set(allEvents.map(e => e.id));
    orderedIds  = allEvents.map(e => e.id);
    renderList();
}

/** Odznacz wszystkie. */
export function deselectAll() {
    selectedIds.clear();
    orderedIds = [];
    renderList();
}
