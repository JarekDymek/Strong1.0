// Plik: js/ui.js
// Cel: Odpowiada za wszystkie interakcje z DOM.

import { getActiveCompetitors, getScores, getCompetitorProfile, getEventHistory } from './state.js';
import { breakTie } from './domain/scoring.js';
import { escapeHTML } from './utils.js';

export let DOMElements = {};

export function initUI() {
    DOMElements = {
        notificationBar: document.getElementById('notification-bar'),
        confirmationModal: document.getElementById('confirmationModal'),
        modalText: document.getElementById('modalText'),
        confirmBtn: document.getElementById('confirmBtn'),
        cancelBtn: document.getElementById('cancelBtn'),
        promptModal: document.getElementById('promptModal'),
        promptText: document.getElementById('promptText'),
        promptInput: document.getElementById('promptInput'),
        promptConfirmBtn: document.getElementById('promptConfirmBtn'),
        promptCancelBtn: document.getElementById('promptCancelBtn'),
        introView: document.getElementById('intro'),
        mainContentView: document.getElementById('mainContent'),
        resultsTableBody: document.querySelector("#resultsTable tbody"),
        categoryFilters: document.getElementById('categoryFilters'),
        competitorSelectionList: document.getElementById('competitorSelectionList'),
        selectionCounter: document.getElementById('selectionCounter'),
        competitorDetailModal: document.getElementById('competitorDetailModal'),
        competitorDetailName: document.getElementById('competitorDetailName'),
        competitorDetailPhoto: document.getElementById('competitorDetailPhoto'),
        competitorDetailMeta: document.getElementById('competitorDetailMeta'),
        competitorDetailNotes: document.getElementById('competitorDetailNotes'),
        // Historia i edycja — teraz w summaryView
        summaryHistoryPanel: document.getElementById('summaryHistoryPanel'),
        summaryEventList: document.getElementById('summaryEventList'),
        summaryEventDetails: document.getElementById('summaryEventDetails'),
        summaryHistoryEmpty: document.getElementById('summaryHistoryEmpty'),
        eventTitle: document.getElementById('eventTitle'),
        highTypeBtn: document.getElementById('highTypeBtn'),
        lowTypeBtn: document.getElementById('lowTypeBtn'),
        competitorForm: document.getElementById('competitorForm'),
        competitorFormBtn: document.getElementById('competitorFormBtn'),
        competitorId: document.getElementById('competitorId'),
        competitorNameInput: document.getElementById('competitorNameInput'),
        birthDateInput: document.getElementById('birthDateInput'),
        residenceInput: document.getElementById('residenceInput'),
        heightInput: document.getElementById('heightInput'),
        weightInput: document.getElementById('weightInput'),
        competitorCategories: document.getElementById('competitorCategories'),
        competitorNotesInput: document.getElementById('competitorNotesInput'),
        competitorListContainer: document.getElementById('competitorListContainer'),
        eventDbPanel: document.getElementById('eventDbPanel'),
        eventForm: document.getElementById('eventForm'),
        eventFormBtn: document.getElementById('eventFormBtn'),
        eventId: document.getElementById('eventId'),
        eventNameDbInput: document.getElementById('eventNameDbInput'),
        eventTypeDbInput: document.getElementById('eventTypeDbInput'),
        eventListContainer: document.getElementById('eventListContainer'),
        selectEventModal: document.getElementById('selectEventModal'),
        selectEventList: document.getElementById('selectEventList'),
        checkpointListContainer: document.getElementById('checkpointListContainer'),
        checkpointList: document.getElementById('checkpointList'),
        storageUsage: document.getElementById('storageUsage'),
        focusModeModal: document.getElementById('focusModeModal'),
        focusCompetitorPhoto: document.getElementById('focusCompetitorPhoto'),
        focusCompetitorName: document.getElementById('focusCompetitorName'),
        focusResultInput: document.getElementById('focusResultInput'),
        eventNameInput: document.getElementById('eventNameInput'),
        eventLocationInput: document.getElementById('eventLocationInput'),
        themeSelector: document.getElementById('themeSelector'),
    };
}

export function calculateAge(birthDateString) {
    if (!birthDateString) return null;
    const birthDate = new Date(birthDateString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

export function showNotification(message, type = 'success', duration = 3000) {
    if (!DOMElements.notificationBar) return;
    const bar = DOMElements.notificationBar;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    bar.innerHTML = `${icons[type] || ''} ${message}`;
    bar.className = type;
    bar.classList.add('show');
    setTimeout(() => bar.classList.remove('show'), duration);
}

export function showConfirmation(message) {
    return new Promise((resolve) => {
        const modal = DOMElements.confirmationModal;
        DOMElements.modalText.textContent = message;
        modal.classList.add('visible');

        const newConfirmBtn = DOMElements.confirmBtn.cloneNode(true);
        DOMElements.confirmBtn.parentNode.replaceChild(newConfirmBtn, DOMElements.confirmBtn);
        DOMElements.confirmBtn = newConfirmBtn;
        // KRYTYCZNE: force-enable po klonowaniu — cloneNode dziedziczy disabled=true
        // gdy setUIBlocked() wyłączyło przyciski przed otwarciem modala
        newConfirmBtn.disabled = false;

        const newCancelBtn = DOMElements.cancelBtn.cloneNode(true);
        DOMElements.cancelBtn.parentNode.replaceChild(newCancelBtn, DOMElements.cancelBtn);
        DOMElements.cancelBtn = newCancelBtn;
        newCancelBtn.disabled = false;

        const close = (value) => { modal.classList.remove('visible'); resolve(value); };
        newConfirmBtn.onclick = () => close(true);
        newCancelBtn.onclick = () => close(false);
    });
}

export function showPrompt(message, defaultValue = '') {
    return new Promise((resolve) => {
        const modal = DOMElements.promptModal;
        DOMElements.promptText.textContent = message;
        DOMElements.promptInput.value = defaultValue;
        modal.classList.add('visible');

        const newConfirmBtn = DOMElements.promptConfirmBtn.cloneNode(true);
        DOMElements.promptConfirmBtn.parentNode.replaceChild(newConfirmBtn, DOMElements.promptConfirmBtn);
        DOMElements.promptConfirmBtn = newConfirmBtn;
        // KRYTYCZNE: force-enable — cloneNode dziedziczy disabled
        newConfirmBtn.disabled = false;

        const newCancelBtn = DOMElements.promptCancelBtn.cloneNode(true);
        DOMElements.promptCancelBtn.parentNode.replaceChild(newCancelBtn, DOMElements.promptCancelBtn);
        DOMElements.promptCancelBtn = newCancelBtn;
        newCancelBtn.disabled = false;

        // Focus po force-enable (wcześniej focus na disabled elemencie był ignorowany)
        DOMElements.promptInput.disabled = false;
        DOMElements.promptInput.focus();
        DOMElements.promptInput.select();

        const close = (value) => {
            modal.classList.remove('visible');
            resolve(value);
        };

        newConfirmBtn.onclick = () => close(DOMElements.promptInput.value);
        newCancelBtn.onclick = () => close(null);
    });
}

export function showCompetitorDetails(profile) {
    if (!profile) return;
    const age = calculateAge(profile.birthDate);
    const categoriesText = (profile.categories && profile.categories.length > 0) ? profile.categories.join(', ') : 'Brak';
    
    DOMElements.competitorDetailName.textContent = profile.name;
    DOMElements.competitorDetailPhoto.src = profile.photo || 'https://placehold.co/150x150/eee/333?text=?';
    DOMElements.competitorDetailMeta.innerHTML = `
        <p><strong>Wiek:</strong> ${age ? age + ' lat' : 'Brak danych'}</p>
        <p><strong>Wzrost:</strong> ${profile.height ? profile.height + ' cm' : 'Brak danych'}</p>
        <p><strong>Waga:</strong> ${profile.weight ? profile.weight + ' kg' : 'Brak danych'}</p>
        <p><strong>Zamieszkanie:</strong> ${profile.residence || 'Brak danych'}</p>
        <p><strong>Kategorie:</strong> ${categoriesText}</p>
    `;
    DOMElements.competitorDetailNotes.textContent = profile.notes || 'Brak dodatkowych informacji.';
    DOMElements.competitorDetailModal.classList.add('visible');
}

export function switchView(viewName) {
    // Helper: animuj wejście widoku
    function animateIn(el) {
        if (!el) return;
        el.style.animation = 'none';
        void el.offsetWidth; // reflow
        el.style.animation = '';
        el.classList.add('view');
    }

    // Ekran 1 – wybór zawodników i konkurencji
    if (DOMElements.introView) {
        DOMElements.introView.style.display = viewName === 'intro' ? 'block' : 'none';
        if (viewName === 'intro') animateIn(DOMElements.introView);
    }
    // Ekran 2 – losowanie (zarządzany przez draw.js)
    const drawView = document.getElementById('drawView');
    if (drawView && viewName !== 'draw') drawView.style.display = 'none';
    // Ekran 3 – rozgrywka
    if (DOMElements.mainContentView) {
        DOMElements.mainContentView.style.display = viewName === 'main' ? 'block' : 'none';
        if (viewName === 'main') animateIn(DOMElements.mainContentView);
    }
    // Panel sędziów — pokazuj tylko gdy trwają zawody (ekran main)
    const judgePanel = document.getElementById('judgeManagementPanel');
    if (judgePanel) judgePanel.style.display = viewName === 'main' ? 'block' : 'none';
    // Ekran 4 – podsumowanie (chowaj przy każdym switchView)
    const summaryView = document.getElementById('summaryView');
    if (summaryView) summaryView.style.display = 'none';
    // Przewiń na górę przy każdej zmianie widoku
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function renderTable() {
    const competitors = getActiveCompetitors();
    const scores = getScores();
    const tbody = DOMElements.resultsTableBody;
    tbody.innerHTML = competitors.map(name => {
        const profile = getCompetitorProfile(name) || {};
        const safeName = escapeHTML(name);
        const safePhoto = escapeHTML(profile.photo || 'https://placehold.co/40x40/eee/333?text=?');
        return `
            <tr data-name="${safeName}">
                <td data-label="Zawodnik">
                    <div class="competitor-cell">
                        <img src="${safePhoto}" class="competitor-photo-thumb" alt="${safeName}" data-action="openStopwatch" title="Uruchom stoper dla ${safeName}">
                        <span>${safeName}</span>
                        <span class="info-icon" data-action="showDetails" aria-label="Pokaż szczegóły zawodnika">ℹ️</span>
                    </div>
                </td>
                <td class="result-cell" data-label="Wynik"><input class="resultInput" data-name="${safeName}" type="text" inputmode="decimal" placeholder="np. 22.35 / 1:05.20 / 018.5" title="Czas: SS.ss lub MM:SS.ss | DNF+dystans: 0XX.XX | DNF: 0 lub puste" /></td>
                <td data-type="place" data-label="Miejsce">-</td>
                <td data-type="points" data-label="Pkt.">0.00</td>
                <td data-type="sum" data-label="Suma">${escapeHTML((scores[name] || 0).toFixed(2))}</td>
            </tr>
        `;
    }).join('');
}

export function updateTableWithEventData(eventResults) {
    const scores = getScores();
    eventResults.forEach((res, idx) => {
        const row = DOMElements.resultsTableBody.querySelector(`tr[data-name="${CSS.escape(res.name)}"]`);
        if (!row) return;
        const input = row.querySelector('.resultInput');
        if (input) {
            if (res.isDnf && !res.isDist) {
                input.value = 'DNF';
                input.title = 'Nie ukończono / brak wyniku';
            } else if (res.isDist) {
                input.value = `DNF+${res.rawInput || res.result}`;
                input.title = 'Nie ukończono na czas, przebyty dystans';
            } else {
                input.value = res.rawInput || res.result;
            }
            // Animacja flash pola
            input.classList.remove('highlight-flash-input');
            void input.offsetWidth;
            input.classList.add('highlight-flash-input');
        }

        const placeCell  = row.querySelector('td[data-type="place"]');
        const pointsCell = row.querySelector('td[data-type="points"]');
        const sumCell    = row.querySelector('td[data-type="sum"]');

        if (placeCell)  placeCell.textContent  = res.place;
        if (pointsCell) {
            pointsCell.textContent = res.points;
            // Flyout animacja punktów
            if (res.points && res.points !== '0' && res.points !== '-') {
                const fly = document.createElement('span');
                fly.className = 'points-flyout';
                fly.textContent = `+${res.points}`;
                fly.style.animationDelay = `${idx * 60}ms`;
                pointsCell.style.position = 'relative';
                pointsCell.appendChild(fly);
                setTimeout(() => fly.remove(), 1400 + idx * 60);
            }
        }
        if (sumCell)    sumCell.textContent    = (scores[res.name] || 0).toFixed(2);

        // Kolorowanie wierszy
        row.classList.toggle('result-dnf',  !!(res.isDnf && !res.isDist));
        row.classList.toggle('result-dist', !!res.isDist);
    });
}

export function lockResultInputs() {
    DOMElements.resultsTableBody.querySelectorAll('.resultInput').forEach(input => input.readOnly = true);
}

export function updateEventTitle(number, overrideTitle = null) {
    const title = overrideTitle ? overrideTitle : `Konkurencja ${number}`;
    DOMElements.eventTitle.textContent = title;

    // Dodaj grafikę konkurencji obok tytułu w event-bar
    try {
        let iconEl = document.getElementById('eventBarIcon');
        if (!iconEl) {
            iconEl = document.createElement('span');
            iconEl.id = 'eventBarIcon';
            iconEl.style.cssText = 'font-size:1.6rem;display:block;text-align:center;line-height:1;filter:drop-shadow(0 2px 8px currentColor);';
            DOMElements.eventTitle.parentNode.insertBefore(iconEl, DOMElements.eventTitle);
        }
        const lower = title.toLowerCase();
        const icons = {
            farmer:'🌾', spacer:'👣', atlas:'🪨', kula:'🏋️', log:'🪵', kłoda:'🪵',
            deadlift:'💀', martwy:'💀', ciąg:'🔗', yoke:'🐂', jarzmo:'🐂',
            car:'🚗', samochód:'🚗', tire:'⭕', opona:'⭕', keg:'🛢️', beczka:'🛢️',
            sandbag:'💼', worek:'💼', husafell:'🏰', overhead:'🔝', press:'💪',
            wyciskanie:'💪', axle:'🔩', conan:'☸️', medley:'🎯', finał:'🏆', final:'🏆',
        };
        let icon = '⚡';
        for (const [key, val] of Object.entries(icons)) { if (lower.includes(key)) { icon = val; break; } }
        iconEl.textContent = icon;
        iconEl.style.animation = 'none'; void iconEl.offsetWidth;
        iconEl.style.animation = 'indicator-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both';
    } catch(e) {}
}

export function updateEventTypeButtons(type) {
    DOMElements.highTypeBtn.classList.toggle('active', type === 'high');
    DOMElements.lowTypeBtn.classList.toggle('active', type === 'low');
}

export function renderCompetitorSelectionUI(allCompetitors) {
    const uniqueCategories = [...new Set(allCompetitors.flatMap(c => c.categories || []))];
    
    DOMElements.categoryFilters.innerHTML = '<button class="filter-btn active" data-filter="all">Wszyscy</button>';
    uniqueCategories.forEach(cat => {
        const safeCat = escapeHTML(cat);
        DOMElements.categoryFilters.innerHTML += `<button class="filter-btn" data-filter="${safeCat}">${safeCat}</button>`;
    });
    
    DOMElements.competitorCategories.innerHTML = uniqueCategories.map(cat => `
        <label><input type="checkbox" name="category" value="${escapeHTML(cat)}"> ${escapeHTML(cat)}</label>
    `).join('') + `<label><input type="checkbox" name="category" value="Nowa Kategoria"> Nowa Kategoria</label>`;


    if (allCompetitors.length === 0) {
        DOMElements.competitorSelectionList.innerHTML = `<p style="text-align:center; padding: 20px;">Baza danych jest pusta. Kliknij "Zarządzaj Zawodnikami", aby dodać pierwszych uczestników.</p>`;
        return;
    }
    DOMElements.competitorSelectionList.innerHTML = allCompetitors.map(c => {
        const categoriesStr = (c.categories && c.categories.length) ? c.categories.join(',') : '';
        const safeName = escapeHTML(c.name);
        const safeCategories = escapeHTML(categoriesStr);
        const safePhoto = escapeHTML(c.photo || 'https://placehold.co/40x40/eee/333?text=?');
        return `
            <label class="competitor-select-item" data-categories="${safeCategories}">
              <input type="checkbox" value="${safeName}">
              <img src="${safePhoto}" class="competitor-photo-thumb">
              <span>${safeName}</span>
            </label>
        `;
    }).join('');
}

export function updateSelectionCounter(count) {
    DOMElements.selectionCounter.textContent = `Wybrano: ${count}`;
}

export function filterCompetitorSelectionList(filter) {
    document.querySelectorAll('#categoryFilters .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    document.querySelectorAll('#competitorSelectionList .competitor-select-item').forEach(item => {
        const itemCategories = item.dataset.categories ? item.dataset.categories.split(',') : [];
        item.style.display = (filter === 'all' || itemCategories.includes(filter)) ? 'flex' : 'none';
    });
}

export function setLogoUI(data) {
    const logoImg = document.getElementById('logoImg');
    const selectLogoBtn = document.getElementById('selectLogoBtn');
    if (data) {
        logoImg.src = data;
        selectLogoBtn.style.display = 'none';
    } else {
        logoImg.src = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzJjM2U1MCIgd2lkdGg9IjE1MHB4IiBoZWlnaHQ9IjE1MHB4Ij48cGF0aCBkPSJNMjIgMTJoLTJ2LTJoLTJ2LTJoLTJ2Mkg4di0ySDZ2MkgydjJoMlYxNGgydjJoMnYyaDJ2LTJoMnYtMmgydjJoMnYtMmgydjJoMnYtMmgydi0yaC0yem0tMTAgNmMtMS4xIDAtMi0uOS0yLTJzLjktMiAyLTIgMiAuOSAyIDJzLS45IDItMiAyetTTE2IDhjMCAxLjEtLjkgMi0yIDJoLTRjLTEuMSAwLTItLjktMi0yVjZoMHYyYzAgLjU1LjQ1IDEgMSAxczEtLjQ1IDEtMVY2aDJ2MmMwIC41NS40NSAxIDEgMXMxLS40NSAxLTFWNmgwdjJ6Ii8+PC9zdmc+"; // Default logo
        selectLogoBtn.style.display = '';
    }
}

export function toggleHistoryPanel() {
    const panel   = DOMElements.summaryHistoryPanel;
    const list    = DOMElements.summaryEventList;
    const details = DOMElements.summaryEventDetails;
    const empty   = DOMElements.summaryHistoryEmpty;
    if (!panel) return;

    const isVisible = panel.style.display === 'block';
    panel.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
        const history = getEventHistory();
        if (!list) return;
        list.innerHTML = '';

        if (history.length === 0) {
            if (empty)   empty.style.display = 'block';
            if (details) details.innerHTML   = '';
            return;
        }
        if (empty) empty.style.display = 'none';

        history.forEach(event => {
            const btn = document.createElement('button');
            btn.textContent        = `✏️ Edytuj: Konkurencja ${event.nr} — ${event.name}`;
            btn.dataset.eventId    = event.nr;
            btn.style.cssText      = 'margin:4px 0;text-align:left;font-size:0.9rem;padding:10px 12px;background:linear-gradient(135deg,#2c3e50,#34495e);';
            list.appendChild(btn);
        });

        if (details) details.innerHTML = '<p style="text-align:center;color:#888;padding:10px;">Wybierz konkurencję powyżej aby edytować wyniki.</p>';
    }
}

export function renderEventForEditing(eventId) {
    const eventToEdit = getEventHistory().find(e => e.nr === eventId);
    if (!eventToEdit) return;
    const details = DOMElements.summaryEventDetails;
    if (!details) return;

    let html = `
        <h4 style="margin-bottom:10px;">✏️ Edycja: Konkurencja ${escapeHTML(eventToEdit.nr)} — ${escapeHTML(eventToEdit.name)}</h4>
        <p style="font-size:0.8rem;color:#888;margin-bottom:8px;">
          Format: czas (22.35 lub 1:22.55) | DNF+dystans (018.5) | DNF (0 lub puste)
        </p>
        <table id="editTable_${escapeHTML(eventId)}" style="width:100%;">
          <thead><tr><th style="text-align:left;">Zawodnik</th><th>Wynik</th><th>Miejsce</th><th>Pkt.</th></tr></thead>
          <tbody>`;

    eventToEdit.results.forEach(w => {
        const safeName = escapeHTML(w.name);
        html += `<tr>
          <td style="padding:6px 4px;">${safeName}</td>
          <td style="padding:6px 4px;"><input class="editable-result" data-name="${safeName}"
            value="${escapeHTML(w.rawInput || w.result)}" type="text" inputmode="decimal"
            style="width:90px;text-align:center;font-size:1rem;padding:6px;"></td>
          <td style="padding:6px 4px;text-align:center;">${escapeHTML(w.place)}</td>
          <td style="padding:6px 4px;text-align:center;">${escapeHTML(w.points)}</td>
        </tr>`;
    });

    html += `</tbody></table>
        <button data-action="save-recalculate" data-event-id="${escapeHTML(eventId)}"
          style="background:linear-gradient(135deg,#27ae60,#1e8449);margin-top:12px;">
          💾 Zapisz i Przelicz Punkty
        </button>`;
    details.innerHTML = html;
    details.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function renderFinalSummary() {
    const competitors  = getActiveCompetitors();
    const scores       = getScores();
    const eventHistory = getEventHistory();
    const eventName    = document.getElementById('summaryEventName')?.textContent || 'Zawody';

    if (!competitors || competitors.length === 0) return;

    // ── Sortowanie z obsługą remisów ──
    const finalStandings = [...competitors].sort((a, b) => {
        const diff = (scores[b] || 0) - (scores[a] || 0);
        if (diff !== 0) return diff;
        return breakTie(a, b, eventHistory, competitors.length).outcome;
    });

    let standingsData = finalStandings.map(name => ({
        name, score: (scores[name] || 0).toFixed(2), tieInfo: '', tieReason: ''
    }));

    // Oznacz remisy
    for (let i = 0; i < standingsData.length - 1; i++) {
        if (standingsData[i].score === standingsData[i + 1].score) {
            const tieResult = breakTie(
                standingsData[i].name, standingsData[i + 1].name,
                eventHistory, competitors.length
            );
            if (tieResult.reason && tieResult.reason !== 'Remis nierozstrzygnięty') {
                standingsData[i].tieInfo   = '⚖️';
                standingsData[i].tieReason = `Wygrana przez: ${tieResult.reason}`;
            }
        }
    }

    // ── KLASYFIKACJA KOŃCOWA ──
    const standingsPanel   = document.getElementById('finalStandingsPanel');
    const standingsContent = document.getElementById('finalStandingsContent');
    if (standingsContent) {
        let html = `<div class="table-wrapper"><table>
            <thead><tr>
              <th style="width:50px">#</th>
              <th>Zawodnik</th>
              <th>Suma</th>
            </tr></thead><tbody>`;

        let displayPlace = 1;
        standingsData.forEach((data, i) => {
            if (i > 0 && standingsData[i - 1].score !== data.score) displayPlace = i + 1;
            const medal  = displayPlace === 1 ? '🥇' : displayPlace === 2 ? '🥈' : displayPlace === 3 ? '🥉' : displayPlace;
            const mClass = displayPlace === 1 ? 'gold' : displayPlace === 2 ? 'silver' : displayPlace === 3 ? 'bronze' : '';
            const profile = getCompetitorProfile(data.name) || {};
            const tieHtml = data.tieReason
                ? `<span class="tie-info" tabindex="0">${data.tieInfo}<span class="tooltip">${data.tieReason}</span></span>`
                : '';
            html += `<tr class="${mClass}">
              <td style="text-align:center;font-size:1.3rem;">${medal}</td>
              <td><div class="competitor-cell">
                <img src="${profile.photo || 'https://placehold.co/40x40/eee/333?text=?'}"
                     class="competitor-photo-thumb" alt="${data.name}">
                <span>${data.name} ${tieHtml}</span>
              </div></td>
              <td style="text-align:center;font-weight:700;font-size:1.1rem;">${data.score}</td>
            </tr>`;
        });
        html += '</tbody></table></div>';
        standingsContent.innerHTML = html;
    }
    if (standingsPanel) standingsPanel.style.display = 'block';

    // ── PEŁNE PODSUMOWANIE KONKURENCJI ──
    const fullPanel   = document.getElementById('fullSummaryPanel');
    const fullContent = document.getElementById('fullSummaryContent');
    if (fullContent && eventHistory.length > 0) {
        let html = '';
        eventHistory.forEach(ev => {
            const typeLabel = ev.type === 'low' ? '⬇️ Mniej=Lepiej' : '⬆️ Więcej=Lepiej';
            html += `<div style="margin-bottom:20px;">
              <h4 style="margin-bottom:6px;">
                Konkurencja ${ev.nr}: ${ev.name}
                <small style="font-weight:400;color:#888;"> — ${typeLabel}</small>
              </h4>
              <div class="table-wrapper"><table>
                <thead><tr>
                  <th style="width:40px">#</th>
                  <th>Zawodnik</th>
                  <th>Wynik</th>
                  <th>Pkt.</th>
                </tr></thead><tbody>`;

            const sorted = [...ev.results].sort((a, b) => {
                const pa = parseFloat(a.points) || 0;
                const pb = parseFloat(b.points) || 0;
                return pb - pa;
            });

            sorted.forEach((res, idx) => {
                const place = res.place === '-' ? '-' : (idx + 1);
                const isDnf = res.place === '-';
                html += `<tr ${isDnf ? 'style="opacity:0.6;"' : ''}>
                  <td style="text-align:center;">${isDnf ? '—' : place}</td>
                  <td>${res.name}</td>
                  <td style="text-align:center;font-family:monospace;">${res.result || '—'}</td>
                  <td style="text-align:center;font-weight:600;">${res.points}</td>
                </tr>`;
            });

            html += '</tbody></table></div></div>';
        });
        fullContent.innerHTML = html;
    }
    if (fullPanel && eventHistory.length > 0) fullPanel.style.display = 'block';
}

export function populateCompetitorForm(competitor) {
    DOMElements.competitorForm.reset();
    DOMElements.competitorId.value = competitor.id;
    DOMElements.competitorNameInput.value = competitor.name;
    DOMElements.birthDateInput.value = competitor.birthDate || '';
    DOMElements.residenceInput.value = competitor.residence || '';
    DOMElements.heightInput.value = competitor.height || '';
    DOMElements.weightInput.value = competitor.weight || '';
    DOMElements.competitorNotesInput.value = competitor.notes || '';
    document.querySelectorAll('#competitorCategories input').forEach(cb => {
        cb.checked = competitor.categories?.includes(cb.value) || false;
    });
    DOMElements.competitorFormBtn.textContent = 'Zapisz Zmiany';
}

export function renderDbCompetitorList(competitors) {
    const container = DOMElements.competitorListContainer;
    if (!container) return;
    container.innerHTML = competitors.map(c => `
        <div class="competitor-list-item">
            <span>${c.name}</span>
            <div class="competitor-list-actions">
                <button data-action="edit-competitor" data-id="${c.id}">Edytuj</button>
                <button data-action="delete-competitor" data-id="${c.id}" style="background:var(--error-color);">Usuń</button>
            </div>
        </div>
    `).join('');
}

export function renderEventsList(events) {
    const container = DOMElements.eventListContainer;
    if (!container) return;
    container.innerHTML = events.map(e => `
        <div class="competitor-list-item">
            <span>${e.name} (${e.type === 'high' ? 'Więcej=L' : 'Mniej=L'})</span>
            <div class="competitor-list-actions">
                 <button data-action="edit-event" data-id="${e.id}">Edytuj</button>
                 <button data-action="delete-event" data-id="${e.id}" style="background:var(--error-color);">Usuń</button>
            </div>
        </div>
    `).join('');
}

export function populateEventForm(event) {
    DOMElements.eventForm.reset();
    DOMElements.eventId.value = event.id;
    DOMElements.eventNameDbInput.value = event.name;
    DOMElements.eventTypeDbInput.value = event.type;
    DOMElements.eventFormBtn.textContent = 'Zapisz Zmiany';
}

export function showSelectEventModal(events) {
    const list = DOMElements.selectEventList;
    list.innerHTML = events.map(e => `
        <div class="lap-item" data-action="select-event" data-id="${e.id}">
            ${e.name}
        </div>
    `).join('');
    DOMElements.selectEventModal.classList.add('visible');
}

// ========================================================================
// NOWA LOGIKA PEŁNOEKRANOWEGO PROMPTERA (DODANA NA KOŃCU PLIKU)
// ========================================================================

let prompterElements; // Zmienna do przechowywania elementów DOM promptera

/**
 * Inicjalizuje prompter - pobiera elementy z DOM i ustawia nasłuchiwanie.
 */
export const initFullscreenPrompter = () => {
    prompterElements = {
        container: document.getElementById('fullscreen-prompter'),
        textElement: document.getElementById('prompter-text'),
        closeButtonTop: document.getElementById('prompter-close-btn-top'),
        closeButtonBottom: document.getElementById('prompter-close-btn-bottom'),
    };

    // Sprawdzenie, czy elementy istnieją, zanim dodamy listenery
    if (!prompterElements.container) { console.warn('Prompter container not found — skipping prompter init.'); return; ;
        return;
    }

    // Nasłuchiwanie na zdarzenia zamykające
    if (prompterElements.closeButtonTop) prompterElements.closeButtonTop.addEventListener('click', hideFullscreenPrompter);
    if (prompterElements.closeButtonBottom) prompterElements.closeButtonBottom.addEventListener('click', hideFullscreenPrompter);
    
    // Zamykanie po kliknięciu w tło
    prompterElements.container.addEventListener('click', (event) => {
        if (event.target === prompterElements.container) {
            hideFullscreenPrompter();
        }
    });

    // Zamykanie klawiszem Escape
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && prompterElements.container.classList.contains('opacity-100')) {
            hideFullscreenPrompter();
        }
    });

    console.log("Pełnoekranowy prompter został zainicjowany.");
};

/**
 * Pokazuje prompter na pełnym ekranie z podanym tekstem.
 */
export const showFullscreenPrompter = (text) => {
    if (!prompterElements) {
        console.error("Prompter nie został zainicjowany. Wywołaj initFullscreenPrompter() przy starcie aplikacji.");
        return;
    }
    prompterElements.textElement.textContent = text;
    prompterElements.container.classList.remove('opacity-0', 'pointer-events-none');
    prompterElements.container.classList.add('opacity-100');
    document.body.style.overflow = 'hidden'; // Blokuje przewijanie tła
};

/**
 * Ukrywa prompter.
 */
export const hideFullscreenPrompter = () => {
    if (!prompterElements) return;
    prompterElements.container.classList.add('opacity-0', 'pointer-events-none');
    prompterElements.container.classList.remove('opacity-100');
    document.body.style.overflow = 'auto'; // Przywraca przewijanie tła
};
