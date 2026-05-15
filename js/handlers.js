// Plik: js/handlers.js
// Cel: Zawiera wszystkie funkcje obsługi zdarzeń (handle...).

import * as State from './state.js';
import * as UI from './ui.js';
import * as Competition from './competition.js';
import * as CompetitorDB from './db-dexie.js';
import * as EventsDB from './eventsDb.js';
import * as History from './history.js';
import * as Persistence from './persistence.js';
import * as Stopwatch from './stopwatch.js';
import * as FocusMode from './focusMode.js';
// ── Sygnały i wibracje (NextGen) ──
import { signalWarning, signalStart, VIB } from './stopwatch.js';

/** Pomocnik: wibracja + dźwięk ostrzeżenia */
function warnSignal() { try { signalWarning(); VIB.warning(); } catch(e){} }
/** Pomocnik: wibracja + dźwięk sukcesu */
function successSignal() {
  try {
    VIB.save();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = 880;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.36);
    setTimeout(() => {
      const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
      o2.connect(g2); g2.connect(ctx.destination);
      o2.type = 'sine'; o2.frequency.value = 1100;
      g2.gain.setValueAtTime(0, ctx.currentTime);
      g2.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.01);
      g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      o2.start(ctx.currentTime); o2.stop(ctx.currentTime + 0.31);
    }, 160);
  } catch(e){}
}
/** Fanfara finałowa */
function fanfareSignal() {
  try {
    VIB.start();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[660,0],[880,0.15],[1100,0.30],[880,0.45],[1100,0.60],[1320,0.75]].forEach(([f,d]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0, ctx.currentTime+d);
      g.gain.linearRampToValueAtTime(0.4, ctx.currentTime+d+0.01);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+d+0.13);
      o.start(ctx.currentTime+d); o.stop(ctx.currentTime+d+0.14);
    });
  } catch(e){}
}

// Dodano wywołanie strażnika przed obsługą przycisku "Następna konkurencja"
const nextEventButton = document.getElementById('nextEventBtn');
if (nextEventButton) {
    nextEventButton.addEventListener('click', async (event) => {
        const canProceed = await Competition.guardNextEventAfterFinal();
        if (!canProceed) {
            event.preventDefault();
            return;
        }
        // ...istniejąca logika obsługi przycisku "Następna konkurencja"...
    });
}

// ... (wszystkie inne funkcje handle... pozostają bez zmian) ...

// --- NOWA, NIEZAWODNA WERSJA EKSPORTU DO HTML Z EDYCJĄ ---
export function handleExportHtml() {
    UI.showNotification('Przygotowywanie raportu…', 'info');

    const eventName    = State.getEventName()    || 'Zawody Strongman';
    const location     = State.getEventLocation() || '';
    const date         = new Date().toLocaleString('pl-PL');
    const eventHistory = State.getEventHistory();
    const logoSrc      = State.getLogo();
    const competitors  = State.getActiveCompetitors();
    const scores       = State.getScores();

    // Walidacja — musi być przynajmniej jedna zakończona konkurencja
    if (!eventHistory || eventHistory.length === 0) {
        return UI.showNotification('Brak wyników — zakończ przynajmniej jedną konkurencję.', 'error');
    }

    const normalizeText = (str) => {
        if (typeof str !== 'string') return str;
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                  .replace(/ł/g, 'l').replace(/Ł/g, 'L');
    };

    // ── Klasyfikacja końcowa — budujemy bezpośrednio ze stanu (bez zależności od DOM) ──
    const sorted = [...competitors].sort((a, b) => (scores[b] || 0) - (scores[a] || 0));
    let rankHtml = '';
    let displayPlace = 1;
    sorted.forEach((name, idx) => {
        if (idx > 0 && (scores[sorted[idx-1]] || 0) !== (scores[name] || 0)) displayPlace = idx + 1;
        const medal = displayPlace === 1 ? '🥇 1' : displayPlace === 2 ? '🥈 2' : displayPlace === 3 ? '🥉 3' : displayPlace;
        rankHtml += `<tr>
            <td style="text-align:center;font-size:13pt;">${medal}</td>
            <td>${normalizeText(name)}</td>
            <td style="text-align:center;font-weight:bold;">${(scores[name] || 0).toFixed(2)}</td>
        </tr>`;
    });

    // ── Szczegółowe wyniki konkurencji ──
    let eventsHtml = '';
    for (const event of eventHistory) {
        const eventResults = [...event.results].sort((a, b) => {
            const pa = parseFloat(a.points) || 0;
            const pb = parseFloat(b.points) || 0;
            return pb - pa;
        });
        eventsHtml += `
            <h4>${normalizeText(event.nr)}. ${normalizeText(event.name)}
              <span style="font-weight:400;font-size:11pt;">
                (${event.type === 'high' ? 'Więcej = lepiej' : 'Mniej = lepiej'})
              </span>
            </h4>
            <table>
                <thead><tr>
                  <th style="width:50px">M-ce</th>
                  <th>Zawodnik</th>
                  <th style="width:100px">Wynik</th>
                  <th style="width:70px">Pkt.</th>
                </tr></thead>
                <tbody>
                    ${eventResults.map(res => `<tr>
                        <td style="text-align:center">${res.place ?? '-'}</td>
                        <td>${normalizeText(res.name)}</td>
                        <td style="text-align:center;font-family:monospace">${res.result ?? '-'}</td>
                        <td style="text-align:center;font-weight:600">${res.points ?? '-'}</td>
                    </tr>`).join('')}
                </tbody>
            </table>`;
    }

    let htmlContent = `
        <div class="header">
            ${logoSrc ? `<img src="${logoSrc}" class="logo" style="max-height:100px;margin-bottom:15px;">` : ''}
            <h1>${normalizeText(eventName)}</h1>
            ${location ? `<h2>${normalizeText(location)}</h2>` : ''}
            <p style="color:#666;font-size:10pt;">Wygenerowano: ${date}</p>
        </div>
        <h3>Klasyfikacja Końcowa</h3>
        <table>
          <thead><tr>
            <th style="width:60px">Miejsce</th>
            <th>Zawodnik</th>
            <th style="width:80px">Suma pkt.</th>
          </tr></thead>
          <tbody>${rankHtml}</tbody>
        </table>
        <h3>Szczegółowe Wyniki Konkurencji</h3>
        ${eventsHtml}
    `;

    // Pokaż modal do edycji
    const modal = document.getElementById('editExportModal');
    const editableContent = document.getElementById('editable-content');
    editableContent.innerHTML = htmlContent;
    modal.classList.add('visible');

    // Obsługa przycisków modala
    document.getElementById('saveAndDownloadBtn').onclick = () => {
        const finalHtml = `
            <!DOCTYPE html>
            <html lang="pl">
            <head>
                <meta charset="UTF-8">
                <title>Wyniki: ${eventName}</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.4; margin: 20px; color: #333; }
                    .container { max-width: 800px; margin: auto; }
                    .header { text-align: center; margin-bottom: 30px; }
                    .logo { max-height: 100px; margin-bottom: 15px; }
                    table { border-collapse: collapse; width: 100%; margin-bottom: 25px; font-size: 10pt; }
                    th, td { border: 1px solid #ccc; padding: 8px; text-align: center; }
                    th { background-color: #f2f2f2; font-weight: bold; }
                    td:nth-child(2) { text-align: left; }
                    h1, h2, h3, h4 { text-align: center; }
                    h1 { font-size: 24pt; margin: 0; }
                    h2 { font-size: 18pt; margin: 5px 0; font-weight: normal; }
                    h3 { font-size: 16pt; border-bottom: 2px solid #333; padding-bottom: 5px; margin-top: 40px; }
                    h4 { font-size: 14pt; text-align: left; margin-top: 25px; margin-bottom: 10px; }
                </style>
            </head>
            <body><div class="container">${editableContent.innerHTML}</div></body></html>
        `;

        // Usuń zdjęcia zawodników z wydruku (base64 zdjęcia zawodników wydłużają plik i psują wygląd)
        // Zachowaj tylko logo zawodów (class="logo")
        const cleanedHtml = finalHtml.replace(
            /<img(?![^>]*class=["']logo["'])[^>]*>/gi,
            ''
        );
        const blob = new Blob([cleanedHtml], { type: 'text/html' });
        const fileDownload = document.createElement("a");
        fileDownload.href = URL.createObjectURL(blob);
        fileDownload.download = `wyniki_${(State.getEventName() || 'zawody').replace(/[\s\/]/g, '_')}.html`;
        document.body.appendChild(fileDownload);
        fileDownload.click();
        document.body.removeChild(fileDownload);

        modal.classList.remove('visible');
        UI.showNotification("Plik HTML został wygenerowany!", "success");
    };

    document.getElementById('cancelExportBtn').onclick = () => {
        modal.classList.remove('visible');
    };
}

// --- POZOSTAŁE FUNKCJE BEZ ZMIAN ---

export async function loadAndRenderInitialData() {
    const competitorsFromDb = await CompetitorDB.getCompetitors();
    State.setAllDbCompetitors(competitorsFromDb);
    UI.renderCompetitorSelectionUI(competitorsFromDb);
}

export function handleThemeChange(e) {
    const theme = e.target.value;
    document.body.className = theme;
    Persistence.saveTheme(theme);
}

export async function handleLogoUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    History.saveToUndoHistory(State.getState());
    const data = await CompetitorDB.toBase64(file);
    State.setLogo(data); 
    UI.setLogoUI(data); 
    History.saveToUndoHistory(State.getState());
    Persistence.triggerAutoSave();
}

export async function handleRemoveLogo() {
    if (!State.getLogo()) return;
    if (await UI.showConfirmation("Czy na pewno chcesz usunąć to logo?")) {
        History.saveToUndoHistory(State.getState());
        State.setLogo(null); 
        UI.setLogoUI(null); 
        History.saveToUndoHistory(State.getState());
        Persistence.triggerAutoSave();
    }
}

export function handleFilterChange(e) {
    if (e.target.matches('.filter-btn')) {
        UI.filterCompetitorSelectionList(e.target.dataset.filter);
    }
}

export function handleSelectionChange() {
    const count = document.querySelectorAll('#competitorSelectionList input:checked').length;
    UI.updateSelectionCounter(count);
}

export async function handleDbFileImport(file) {
    // BUG-H1 fix: opakuj FileReader w Promise żeby await działał poprawnie
    if (!file) return;
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (await UI.showConfirmation('Czy na pewno chcesz importować bazę zawodników? Obecna baza zostanie nadpisana.')) {
                    const { added, updated } = await CompetitorDB.importCompetitorsFromJson(importedData);
                    // Odśwież listę wyboru zawodników (ekran startowy)
                    await loadAndRenderInitialData();
                    // Odśwież panel zarządzania bazą jeśli jest otwarty
                    const dbPanel = document.getElementById('competitorDbPanel');
                    if (dbPanel && dbPanel.classList.contains('visible')) {
                        await handleManageCompetitors();
                    }
                }
            } catch (error) {
                UI.showNotification(`Błąd importu: ${error.message}`, 'error');
            } finally {
                resolve();
            }
        };
        reader.onerror = () => { UI.showNotification('Błąd odczytu pliku.', 'error'); resolve(); };
        reader.readAsText(file);
    });
}

export async function handleEventsDbFileImport(file) {
    // BUG-H2 fix: opakuj FileReader w Promise
    if (!file) return;
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (!Array.isArray(importedData)) throw new Error('Plik nie jest listą konkurencji.');
                if (await UI.showConfirmation('Czy na pewno chcesz importować bazę konkurencji? Obecna baza zostanie nadpisana.')) {
                    const { added, updated } = await EventsDB.importEventsFromJson(importedData);
                    // Odśwież panel listy konkurencji
                    await handleManageEvents();
                }
            } catch (error) {
                UI.showNotification(`Błąd importu konkurencji: ${error.message}`, 'error');
            } finally {
                resolve();
            }
        };
        reader.onerror = () => { UI.showNotification('Błąd odczytu pliku.', 'error'); resolve(); };
        reader.readAsText(file);
    });
}

export async function handleImportState(file, refreshFullUICallback) {
    // BUG-09 fix: refreshFullUICallback was declared but never called
    if (!file) return false;
    const result = await Persistence.importStateFromFile(file);
    if (result && typeof refreshFullUICallback === 'function') {
        refreshFullUICallback();
    }
    return result;
}

export function handleStartCompetition(refreshFullUICallback) {
    const selectedInputs = document.querySelectorAll('#competitorSelectionList input:checked');
    const selectedCompetitors = Array.from(selectedInputs).map(input => input.value);
    if (selectedCompetitors.length < 2) {
        UI.showNotification("Wybierz co najmniej dwóch zawodników.", "error");
        return false;
    }

    History.saveToUndoHistory(State.getState());
    State.startCompetition(selectedCompetitors);
    History.saveToUndoHistory(State.getState());
    const _evName = State.getEventName() || 'Zawody';
    Persistence.triggerAutoSaveWithContext('Rozpoczęcie zawodów');
    Persistence.exportStateToFile(`Rozpoczęcie_${_evName}`);
    return true; // Sygnał do odświeżenia UI
}

export async function handleEventTypeChange(type) {
    if (type === State.getEventType()) return;
    const currentEventNum = State.getEventNumber();
    const alreadyDone = State.getEventHistory().some(e => Number(e.nr) === Number(currentEventNum));
    const hasEnteredResults = Array.from(document.querySelectorAll('#resultsTable .resultInput'))
        .some(input => input.value.trim() !== '');

    if ((alreadyDone || hasEnteredResults) && !await UI.showConfirmation(
        'Zmiana zasady punktacji moze zmienic miejsca i punkty dla tej konkurencji.\n\n' +
        'Kontynuowac?'
    )) return;

    History.saveToUndoHistory(State.getState());
    State.setEventType(type);
    UI.updateEventTypeButtons(type);
    Persistence.triggerAutoSave();
}

export async function handleCalculatePoints() {
    // GUARD: Sprawdź czy punkty nie zostały już przyznane dla tej konkurencji
    const currentEventNum = State.getEventNumber();
    const alreadyDone = State.getEventHistory().find(e => e.nr === currentEventNum);
    if (alreadyDone) {
        if (!await UI.showConfirmation(
            `Punkty dla Konkurencji ${currentEventNum} zostały już przyznane!\n` +
            `Czy chcesz nadpisać wyniki? Spowoduje to przeliczenie wszystkich punktów.`
        )) return false;
        // Usuń poprzedni wpis z historii żeby nie zduplikować
        if (typeof State.removeEventFromHistory === "function") State.removeEventFromHistory(currentEventNum);
    }

    const resultInputs = document.querySelectorAll('#resultsTable .resultInput');
    // GUARD: Sprawdź czy wpisano jakiekolwiek wyniki
    const values = Array.from(resultInputs).map(i => i.value.trim()).filter(v => v !== '');
    if (values.length === 0) {
        warnSignal();
        UI.showNotification('Wpisz wyniki zawodników przed przyznaniem punktów.', 'error');
        return false;
    }

    History.saveToUndoHistory(State.getState());
    const currentResults = Array.from(resultInputs).map(input => ({ name: input.dataset.name, result: input.value }));
    const { results, error } = Competition.calculateEventPoints(currentResults, State.getActiveCompetitors().length, State.getEventType());
    if (error) {
        warnSignal();
        UI.showNotification(
            '❌ Błędny format wyniku. Dozwolone: czas (22.35 lub 1:22.55), ' +
            'DNF+dystans (018.5), DNF (0 lub puste).',
            'error'
        );
        return false;
    }

    const eventName = document.getElementById('eventTitle').textContent.trim();
    State.addEventToHistory({ nr: currentEventNum, name: eventName, type: State.getEventType(), results });
    UI.updateTableWithEventData(results);
    UI.lockResultInputs();
    UI.showNotification(`Punkty dla "${eventName}" przyznane!`, 'success');
    successSignal();
    History.saveToUndoHistory(State.getState());
    const cpLabel = `Po_przyznaniu_punktow_Konk_${currentEventNum}_${eventName}`;
    Persistence.triggerAutoSaveWithContext(`Po przyznaniu punktów – Konk. ${currentEventNum}: ${eventName}`);
    Persistence.exportStateToFile(cpLabel);
    return true;
}

export async function handleNextEvent() {
    const inputs = document.querySelectorAll('#resultsTable .resultInput:not([readonly])');
    if (inputs.length > 0) {
        const eventName = document.getElementById('eventTitle')?.textContent?.trim() || '';
        if (!await UI.showConfirmation(
            `Nie przyznano jeszcze punktów dla: "${eventName}".\n` +
            `Przejście dalej bez przyznania punktów spowoduje pominięcie tej konkurencji.\n\n` +
            `Czy na pewno chcesz kontynuować?`
        )) return false;
    }

    // Sprawdź czy następna konkurencja jest OSTATNIĄ (finałową) z zaplanowanych
    const planned = State.getPlannedEvents();
    const currentEventNumber = State.getEventNumber(); // przed inkrementem
    if (planned && planned.length > 0) {
        const nextIndex = currentEventNumber; // indeks następnej (0-based, eventNumber jest 1-based)
        if (nextIndex === planned.length - 1) {
            // Następna konkurencja to ostatnia — uruchom logikę finału
            const finalEventData = planned[planned.length - 1];
            if (!await UI.showConfirmation(
                `Następna konkurencja to ostatnia z wybranych — "${finalEventData.name}".\n` +
                `Zostanie ustawiona jako KONKURENCJA FINAŁOWA.\n` +
                `Kolejność startu zostanie ODWRÓCONA (gorsi zawodnicy startują pierwsi).\n\n` +
                `Czy chcesz kontynuować?`
            )) return false;

            const success = await Competition.setupFinalEvent(Competition.breakTie);
            if (success) {
                State.setEventTitle(finalEventData.name + ' (FINAŁ)');
                document.getElementById('eventTitle').textContent = finalEventData.name + ' (FINAŁ)';
                State.setEventType(finalEventData.type);
                const { updateEventTypeButtons } = await import('./ui.js');
                updateEventTypeButtons(finalEventData.type);
                History.saveToUndoHistory(State.getState());
                const _finalTitle = State.getEventTitle();
                Persistence.triggerAutoSaveWithContext(`Przed Finałem: ${_finalTitle}`);
            }
            return success;
        }
    }

    History.saveToUndoHistory(State.getState());
    State.nextEvent();

    // Jeśli są zaplanowane konkurencje, ustaw tytuł i typ następnej
    if (planned && planned.length > 0) {
        const nextIndex = State.getEventNumber() - 1; // eventNumber już po inkremencie
        if (nextIndex < planned.length) {
            const nextEv = planned[nextIndex];
            State.setEventTitle(nextEv.name);
            document.getElementById('eventTitle').textContent = nextEv.name;
            State.setEventType(nextEv.type);
            const { updateEventTypeButtons } = await import('./ui.js');
            updateEventTypeButtons(nextEv.type);
        }
    }

    History.saveToUndoHistory(State.getState());
    const _nextTitle = State.getEventTitle() || `Konkurencja ${State.getEventNumber()}`;
    Persistence.triggerAutoSaveWithContext(`Przed Konkurencją ${State.getEventNumber()}: ${_nextTitle}`);
    return true;
}


export async function handleFinalEvent() {
    // GUARD: potwierdzenie przed przejściem do finału
    const eventName = document.getElementById('eventTitle')?.textContent?.trim() || '';
    const inputs = document.querySelectorAll('#resultsTable .resultInput:not([readonly])');
    if (inputs.length > 0) {
        if (!await UI.showConfirmation(
            `Nie przyznano punktów dla: "${eventName}".\n` +
            `Przejście do Finału bez przyznania punktów pominie tę konkurencję.\n\n` +
            `Czy na pewno chcesz przejść do Konkurencji Finałowej?`
        )) return false;
    } else {
        if (!await UI.showConfirmation(
            `Czy na pewno chcesz przejść do Konkurencji Finałowej?\n` +
            `Kolejność startu zostanie ODWRÓCONA (gorsi zawodnicy startują pierwsi).`
        )) return false;
    }

    // Jeśli mamy zaplanowane konkurencje, znajdź ostatnią (finałową) i użyj jej nazwy/typu
    const planned = State.getPlannedEvents();
    let finalEventData = null;
    if (planned && planned.length > 0) {
        finalEventData = planned[planned.length - 1]; // ostatnia = finał
    }

    const success = await Competition.setupFinalEvent(Competition.breakTie);
    if (success) {
        fanfareSignal();
        // Nadpisz tytuł i typ jeśli mamy dane z plannedEvents
        if (finalEventData) {
            State.setEventTitle(finalEventData.name + ' (FINAŁ)');
            document.getElementById('eventTitle').textContent = finalEventData.name + ' (FINAŁ)';
            State.setEventType(finalEventData.type);
            const { updateEventTypeButtons } = await import('./ui.js');
            updateEventTypeButtons(finalEventData.type);
        }
        History.saveToUndoHistory(State.getState());
        const _finalTitle = State.getEventTitle() || 'Konkurencja Finałowa';
        Persistence.triggerAutoSaveWithContext(`Przed Finałem: ${_finalTitle}`);
    }
    return success;
}

export function handleUndo() {
    const previousState = History.undo(State.getState());
    if (previousState) { 
        State.restoreState(previousState); 
        Persistence.triggerAutoSave(); 
        return true;
    }
    return false;
}

export function handleRedo() {
    const nextState = History.redo(State.getState());
    if (nextState) { 
        State.restoreState(nextState); 
        Persistence.triggerAutoSave(); 
        return true;
    }
    return false;
}

export async function handleSaveAndRecalculate(eventId) {
    if (!await UI.showConfirmation(
        `Zmieniasz zatwierdzone wyniki konkurencji ${eventId}.\n` +
        'System przeliczy cala klasyfikacje.\n\n' +
        'Zapisac zmiany i przeliczyc punkty?'
    )) return false;

    History.saveToUndoHistory(State.getState());
    const editedInputs = document.querySelectorAll(`#editTable_${eventId} .editable-result`);
    const newResults = Array.from(editedInputs).map(input => ({ name: input.dataset.name, result: input.value }));
    if (typeof State.updateEventResults === 'function') State.updateEventResults(eventId, newResults);
    if (typeof State.recalculateAllPoints === 'function') State.recalculateAllPoints(Competition.calculateEventPoints);
    UI.showNotification("Wyniki zostały przeliczone!", "success");
    History.saveToUndoHistory(State.getState());
    Persistence.triggerAutoSaveWithContext(`Po przeliczeniu wyników Konkurencji ${eventId}`);
    return true;
}

export function handleStopwatchSave(competitorName, result, eventType) {
    const input = document.querySelector(`#resultsTable .resultInput[data-name="${CSS.escape(competitorName)}"]`);
    if (input) {
        History.saveToUndoHistory(State.getState());
        input.value = result;
        State.setEventType(eventType);
        UI.updateEventTypeButtons(eventType);
        History.saveToUndoHistory(State.getState());
        Persistence.triggerAutoSaveWithContext(`Po zapisie stopera – ${competitorName}`);
        UI.showNotification(`Zapisano wynik dla ${competitorName}.`, "success");
        document.dispatchEvent(new CustomEvent('strongman:result-updated'));
    }
}

export async function handleGenerateEventName() {
    // BUG-01 fix: zmienne loading, output i namesText były niezdefiniowane
    if (!navigator.onLine) {
        return UI.showNotification('Funkcje AI wymagają połączenia z internetem.', 'error');
    }
    const locationVal = (document.getElementById('eventLocationInput')?.value || '').trim();
    if (!locationVal) return UI.showNotification('Wprowadź lokalizację zawodów.', 'error');

    const output  = document.getElementById('eventNameSuggestions');
    const loading = document.getElementById('eventNameLoading');
    if (!output) return;

    if (loading) loading.style.display = 'block';
    output.innerHTML = '';

    const prompt = `Zaproponuj 5 chwytliwych, kreatywnych nazw dla zawodów strongman w: "${locationVal}". Podaj tylko same nazwy, każdą w nowej linii, bez numeracji.`;
    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 256,
                messages: [{ role: 'user', content: prompt }]
            })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const namesText = data.content?.[0]?.text || '';
        namesText.split('\n').filter(n => n.trim()).forEach(name => {
            const btn = document.createElement('button');
            btn.className = 'suggestion-btn';
            btn.style.cssText = 'display:block;width:100%;margin:4px 0;padding:8px 12px;background:#2980b9;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem;text-align:left;';
            btn.textContent = name.replace(/[*"]/g, '').replace(/^\d+\.?\s*/, '').trim();
            btn.addEventListener('click', () => {
                const nameInput = document.getElementById('eventNameInput');
                if (nameInput) nameInput.value = btn.textContent;
            });
            output.appendChild(btn);
        });
    } catch (err) {
        console.error('handleGenerateEventName error:', err);
        UI.showNotification('Błąd generowania nazw AI.', 'error');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

// ========================================================================
// ZAKTUALIZOWANA FUNKCJA OBSŁUGI ZAPOWIEDZI SPIKERA
// ========================================================================
export async function handleGenerateAnnouncement() {
    if (!navigator.onLine) {
        return UI.showNotification("Funkcje AI wymagają połączenia z internetem.", "error");
    }
    const competitors = State.getActiveCompetitors();
    if (competitors.length === 0) {
        return UI.showNotification("Rozpocznij zawody, aby wygenerować zapowiedź.", "error");
    }
    const prompt = `Jesteś spikerem na zawodach strongman. Stwórz krótką, ekscytującą zapowiedź nadchodzącej konkurencji: "${document.getElementById('eventTitle').textContent}". Wymień kilku startujących zawodników, np.: ${competitors.slice(0,3).join(', ')}. Użyj dynamicznego języka.`;

    // BUG-02 fix: dodano faktyczne wywołanie API — announcement było zawsze undefined
    UI.showFullscreenPrompter('⏳ Generowanie zapowiedzi...');

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 512,
                messages: [{ role: 'user', content: prompt }]
            })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const announcement = data.content?.[0]?.text || '';
        if (announcement.trim()) {
            UI.showFullscreenPrompter(announcement);
        } else {
            throw new Error('Otrzymano pustą odpowiedź od AI.');
        }
    } catch (error) {
        UI.hideFullscreenPrompter();
        UI.showNotification('Błąd generowania zapowiedzi.', 'error');
        console.error('handleGenerateAnnouncement error:', error);
    }
}

export async function handleManageCompetitors() {
    document.getElementById('competitorDbPanel').classList.add('visible');
    const competitors = await CompetitorDB.getCompetitors();
    UI.renderDbCompetitorList(competitors);
    const uniqueCategories = [...new Set(competitors.flatMap(c => c.categories || []))];
    UI.DOMElements.competitorCategories.innerHTML = uniqueCategories.map(cat => `
        <label><input type="checkbox" name="category" value="${cat}"> ${cat}</label>
    `).join('');
}

export async function handleCompetitorFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('competitorId').value;
    const photoFile = document.getElementById('competitorPhotoInput').files[0];
    let photoData = null;
    // Konwertuj zdjęcie do JFIF 120×120 (crop do kwadratu, środek obrazu)
    // Zmniejsza rozmiar bazy i ujednolica zdjęcia w wynikach/sejfach
    if (photoFile) photoData = await CompetitorDB.toJfif120(photoFile);

    const competitorData = {
        name: document.getElementById('competitorNameInput').value.trim(),
        birthDate: document.getElementById('birthDateInput').value,
        residence: document.getElementById('residenceInput').value.trim(),
        height: document.getElementById('heightInput').value,
        weight: document.getElementById('weightInput').value,
        notes: document.getElementById('competitorNotesInput').value.trim(),
        categories: Array.from(document.querySelectorAll('#competitorCategories input:checked')).map(cb => cb.value),
    };
    if (id) competitorData.id = parseInt(id, 10);

    if (!photoData && id) {
        const existing = await CompetitorDB.getCompetitorById(parseInt(id, 10));
        if (existing) competitorData.photo = existing.photo;
    } else if (photoData) {
        competitorData.photo = photoData;
    }
    await CompetitorDB.saveCompetitor(competitorData);
    UI.showNotification(id ? 'Zawodnik zaktualizowany!' : 'Zawodnik dodany!', 'success');
    e.target.reset();
    document.getElementById('competitorId').value = '';
    document.getElementById('competitorFormBtn').textContent = 'Dodaj Zawodnika';
    await handleManageCompetitors();
    await loadAndRenderInitialData();
}

export async function handleCompetitorListAction(e) {
    const action = e.target.dataset.action;
    const id = parseInt(e.target.dataset.id, 10);
    if (!action || !id) return;
    if (action === 'edit-competitor') {
        const competitor = (await CompetitorDB.getCompetitors()).find(c => c.id === id);
        if(competitor) UI.populateCompetitorForm(competitor);
    } else if (action === 'delete-competitor') {
        if (await UI.showConfirmation("Czy na pewno usunąć tego zawodnika?")) {
            await CompetitorDB.deleteCompetitor(id);
            UI.showNotification('Zawodnik usunięty.', 'success');
            await handleManageCompetitors();
            await loadAndRenderInitialData();
        }
    }
}

export async function handleManageEvents() {
    document.getElementById('eventDbPanel').classList.add('visible');
    const events = await EventsDB.getEvents();
    UI.renderEventsList(events);
}

export async function handleEventFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('eventId').value;
    const eventData = {
        name: document.getElementById('eventNameDbInput').value.trim(),
        type: document.getElementById('eventTypeDbInput').value,
    };
    if (id) eventData.id = parseInt(id, 10);
    await EventsDB.saveEvent(eventData);
    UI.showNotification(id ? 'Konkurencja zaktualizowana!' : 'Konkurencja dodana!', 'success');
    e.target.reset();
    document.getElementById('eventId').value = '';
    document.getElementById('eventFormBtn').textContent = 'Dodaj Konkurencję';
    await handleManageEvents();
}

export async function handleEventListAction(e) {
    const action = e.target.dataset.action;
    const id = parseInt(e.target.dataset.id, 10);
    if (!action || !id) return;
    if (action === 'edit-event') {
        const event = (await EventsDB.getEvents()).find(ev => ev.id === id);
        if (event) UI.populateEventForm(event);
    } else if (action === 'delete-event') {
        if (await UI.showConfirmation("Czy na pewno usunąć tę konkurencję?")) {
            await EventsDB.deleteEvent(id);
            UI.showNotification('Konkurencja usunięta.', 'success');
            await handleManageEvents();
        }
    }
}

export async function handleSelectEventFromDb() {
    const events = await EventsDB.getEvents();
    if(events.length === 0) return UI.showNotification("Baza konkurencji jest pusta.", "info");
    UI.showSelectEventModal(events);
}

export async function handleEventSelection(e) {
    if (e.target.dataset.action !== 'select-event') return;
    const eventId = parseInt(e.target.dataset.id, 10);
    const events = await EventsDB.getEvents();
    const selectedEvent = events.find(ev => ev.id === eventId);
    if (selectedEvent) {
        History.saveToUndoHistory(State.getState());
        document.getElementById('eventTitle').textContent = selectedEvent.name;
        State.setEventType(selectedEvent.type);
        UI.updateEventTypeButtons(selectedEvent.type);
        document.getElementById('selectEventModal').classList.remove('visible');
        History.saveToUndoHistory(State.getState());
        Persistence.triggerAutoSave();
    }
}

