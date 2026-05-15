// Plik: js/main.js
// Cel: Główny plik aplikacji, który importuje wszystkie inne moduły i łączy je ze sobą, rejestrując detektory zdarzeń.

import * as UI from './ui.js';
import * as State from './state.js';
import * as History from './history.js';
import * as Persistence from './persistence.js';
import * as CompetitorDB from './db-dexie.js';
import * as EventsDB from './eventsDb.js';
import * as Stopwatch from './stopwatch.js';
import { signalPoints, signalNext, signalFanfare, VIB } from './stopwatch.js';
import * as FocusMode from './focusMode.js';
import * as Handlers from './handlers.js';
import * as CheckpointsDB from './checkpointsDb.js';
import { AppConfig } from './app-config.js';
import * as EventsSelector from './eventsSelector.js';
import * as Draw from './draw.js';
import * as LiveDisplay from './liveDisplay.js';
import * as Judge from './judge.js';
import { escapeHTML } from './utils.js';


// Global helper: show overlay and block interactive controls
function setUIBlocked(blocked) {
    try {
        const overlay = document.getElementById('appLoaderOverlay');

        // Pokaż lub ukryj overlay
        if (blocked) {
            if (overlay) {
                overlay.style.display = 'flex';
                overlay.setAttribute('aria-hidden', 'false');
            }
        } else {
            if (overlay) {
                // drobne opóźnienie, by uniknąć migotania
                setTimeout(() => {
                    overlay.style.display = 'none';
                    overlay.setAttribute('aria-hidden', 'true');
                }, 50);
            }
        }

        // Wyłącz/włącz kontrolki formularzy.
        // WYJĄTKI — nigdy nie blokuj:
        //  1. input[type=file] — żeby wybór pliku zawsze działał
        //  2. elementów wewnątrz .modal-overlay — żeby modale (potwierdzenia, prompty)
        //     działały nawet gdy reszta UI jest zablokowana
        const MODAL_IDS = new Set([
            'confirmBtn','cancelBtn','promptConfirmBtn','promptCancelBtn','selectEventCancelBtn'
        ]);
        const elems = document.querySelectorAll('button, input, select, textarea');
        elems.forEach(el => {
            try {
                // Nigdy nie blokuj plików
                if (el.tagName.toLowerCase() === 'input' && el.type === 'file') return;
                // Nigdy nie blokuj przycisków modali
                if (MODAL_IDS.has(el.id)) { el.disabled = false; return; }
                // Nigdy nie blokuj elementów wewnątrz widocznego modala
                if (el.closest('.modal-overlay.visible, #drawView, #fullscreenStopwatch')) return;
                el.disabled = !!blocked;
            } catch (e) { /* ignoruj */ }
        });

        // Ustaw focus na overlay gdy zablokowane
        if (blocked && overlay) {
            try { overlay.focus(); } catch (e) {}
        }
    } catch (e) {
        console.warn('setUIBlocked error', e);
    }
}


/* ═══════════════════════════════════════════════════════
   SYSTEM TIMELINE — podświetla kolejny wymagany przycisk
   podczas zawodów, prowadząc sędziego krok po kroku.

   Kroki w czasie zawodów:
   1. "calculate" → Przyznaj Punkty          (zielony puls)
   2. "next"      → Następna / Finał         (pomarańczowy puls)
   3. "summary"   → Podsumowanie             (fioletowy puls)

   Logika: po wpisaniu wyników pulsuje "calculate",
   po przyznaniu punktów pulsuje "next",
   po przejściu do ostatniej konkurencji pulsuje "final".
═══════════════════════════════════════════════════════ */
const Timeline = (() => {
    const STEPS = {
        calculate: { id: 'calculatePointsBtn', cls: 'tl-pulse-green',  label: '✅ Przyznaj punkty' },
        next:      { id: 'nextEventBtn',       cls: 'tl-pulse-orange', label: '▶ Następna konkurencja' },
        final:     { id: 'finalEventBtn',      cls: 'tl-pulse-purple', label: '🏆 Finał' },
        summary:   { id: 'showFinalSummaryBtn',cls: 'tl-pulse-blue',   label: '📊 Podsumowanie' },
    };
    let _current = null;
    let _timer   = null;

    function clearAll() {
        Object.values(STEPS).forEach(s => {
            const el = document.getElementById(s.id);
            if (el) el.classList.remove(s.cls, 'tl-active');
        });
        const hint = document.getElementById('timelineHint');
        if (hint) hint.textContent = '';
        clearTimeout(_timer);
    }

    function pulse(step, autoClearMs = 0) {
        clearAll();
        const s = STEPS[step];
        if (!s) return;
        _current = step;
        const btn = document.getElementById(s.id);
        if (btn) {
            btn.classList.add(s.cls, 'tl-active');
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        const hint = document.getElementById('timelineHint');
        if (hint) hint.textContent = `👉 ${s.label}`;
        if (autoClearMs > 0) _timer = setTimeout(clearAll, autoClearMs);
    }

    function clear() { clearAll(); _current = null; }

    /** Wywoływana po każdej zmianie w polu wyniku — pulsuje "calculate" */
    function onResultInput() {
        if (_current === 'calculate') return; // już pulsuje
        pulse('calculate');
    }

    return { pulse, clear, onResultInput };
})();

const ActiveActionGuide = (() => {
    const STEPS = {
        calculate: { id: 'calculatePointsBtn', cls: 'tl-pulse-green', label: 'Przyznaj punkty' },
        next: { id: 'nextEventBtn', cls: 'tl-pulse-orange', label: 'Nastepna konkurencja' },
        final: { id: 'finalEventBtn', cls: 'tl-pulse-purple', label: 'Konkurencja finalowa' },
        summary: { id: 'showFinalSummaryBtn', cls: 'tl-pulse-blue', label: 'Podsumowanie' },
    };
    const ACTION_CLASSES = ['tl-pulse-green', 'tl-pulse-orange', 'tl-pulse-purple', 'tl-pulse-blue', 'tl-active', 'tl-muted'];

    function clear() {
        Object.values(STEPS).forEach(step => {
            const btn = document.getElementById(step.id);
            if (btn) btn.classList.remove(...ACTION_CLASSES);
        });
    }

    function setHint(message) {
        const hint = document.getElementById('timelineHint');
        if (hint) hint.textContent = message || '';
    }

    function isCurrentEventScored(state) {
        return (state.eventHistory || []).some(event => Number(event.nr) === Number(state.eventNumber || 1));
    }

    function getResultStats() {
        const inputs = Array.from(document.querySelectorAll('#resultsTable .resultInput'));
        const editable = inputs.filter(input => !input.readOnly);
        const filled = editable.filter(input => input.value.trim() !== '');
        return { total: editable.length, filled: filled.length };
    }

    function getNextStep() {
        const state = State.getState();
        const planned = state.plannedEvents || [];
        const currentNr = state.eventNumber || 1;
        const scored = isCurrentEventScored(state);
        const stats = getResultStats();
        const isLastPlanned = planned.length > 0 && currentNr >= planned.length;
        const nextIsFinal = planned.length > 0 && currentNr === planned.length - 1;

        if (!state.competitors || state.competitors.length === 0) return null;
        if (!scored) {
            if (stats.total === 0) return null;
            if (stats.filled === 0) return { message: 'Najpierw wpisz wyniki zawodnikow.' };
            if (stats.filled < stats.total) {
                return {
                    step: 'calculate',
                    message: `Uzupelniono ${stats.filled}/${stats.total}. Przyznaj punkty, gdy brakujace wyniki sa celowo DNF.`
                };
            }
            return { step: 'calculate', message: 'Wszystkie wyniki sa wpisane. Teraz przyznaj punkty.' };
        }
        if (isLastPlanned) return { step: 'summary', message: 'Ostatnia konkurencja jest podsumowana. Przejdz do wynikow koncowych.' };
        if (nextIsFinal) return { step: 'final', message: 'Kolejny krok to final. Ustaw konkurencje finalowa.' };
        return { step: 'next', message: 'Konkurencja podsumowana. Przejdz do nastepnej.' };
    }

    function update() {
        clear();
        const next = getNextStep();
        if (!next) {
            setHint('');
            return;
        }
        setHint(next.message || '');
        if (!next.step || !STEPS[next.step]) return;

        const active = STEPS[next.step];
        Object.values(STEPS).forEach(step => {
            const btn = document.getElementById(step.id);
            if (!btn) return;
            if (step.id === active.id) {
                btn.classList.add(step.cls, 'tl-active');
                btn.setAttribute('aria-label', `Kolejny krok: ${step.label}`);
            } else {
                btn.classList.add('tl-muted');
            }
        });
    }

    return { update, clear };
})();

/* ═══════════════════════════════════════════════════════
   CONFETTI BURST — efekt świetlny przy sukcesie
   Używa czystego CSS + DOM, zero zewnętrznych bibliotek
═══════════════════════════════════════════════════════ */
function confettiBurst(count = 18) {
    const colors = ['#FF4500','#FFB800','#39FF14','#00E5CC','#A855F7','#3B82F6','#EF4444','#F59E0B'];
    const container = document.getElementById('mainContent') || document.body;
    const rect = container.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
        const dot = document.createElement('div');
        const color = colors[i % colors.length];
        const x = 20 + Math.random() * 60; // % szerokości
        const size = 6 + Math.random() * 8;
        const delay = Math.random() * 0.4;
        const dur = 0.7 + Math.random() * 0.6;
        dot.style.cssText =
            `position:fixed;left:${x}vw;top:${rect.top + 60}px;` +
            `width:${size}px;height:${size}px;border-radius:${Math.random()>0.5?'50%':'3px'};` +
            `background:${color};pointer-events:none;z-index:9998;` +
            `animation:confetti-drop ${dur}s ${delay}s ease-out forwards;`;
        document.body.appendChild(dot);
        setTimeout(() => dot.remove(), (delay + dur + 0.1) * 1000);
    }
}


/**
 * Aktualizuje wskaźnik postępu zawodów (nowy redesign UI).
 */
function updateCompetitionProgress() {
    try {
        const state = State.getState();
        const planned = state.plannedEvents || [];
        const history = state.eventHistory || [];
        const currentNr = state.eventNumber || 1;
        const total = planned.length || Math.max(history.length, currentNr);

        const elNum   = document.getElementById('progCurrentNum');
        const elTotal = document.getElementById('progTotalNum');
        const elName  = document.getElementById('progEventName');
        const elFill  = document.getElementById('progFill');
        const elDots  = document.getElementById('progDots');

        if (elNum)   elNum.textContent  = currentNr;
        if (elTotal) elTotal.textContent = total || '?';
        if (elName)  elName.textContent  = state.eventTitle || `Konkurencja ${currentNr}`;
        if (elFill && total > 0) {
            const pct = Math.min(100, Math.round((currentNr / total) * 100));
            elFill.style.width = pct + '%';
        }
        if (elDots && total > 0) {
            elDots.innerHTML = '';
            for (let i = 1; i <= total; i++) {
                const dot = document.createElement('div');
                const isDone   = i < currentNr || history.some(e => e.nr === i);
                const isActive = i === currentNr;
                dot.className = 'prog-dot' + (isDone ? ' pd-done' : isActive ? ' pd-active' : '');
                dot.title = planned[i-1]?.name || `Konkurencja ${i}`;
                elDots.appendChild(dot);
            }
        }
    } catch(e) {
        // ignoruj gdy elementy nie istnieją (ekran intro)
    }
}

/**
 * Odświeża cały interfejs użytkownika na podstawie aktualnego stanu aplikacji.
 */
function refreshFullUI() {
    const currentState = State.getState();
    State.setAllDbCompetitors(currentState.allDbCompetitors || []);
    
    updateCompetitionProgress();

    if (currentState.competitors && currentState.competitors.length > 0) {
        UI.switchView('main');
        UI.updateEventTitle(currentState.eventNumber, currentState.eventTitle);
        UI.updateEventTypeButtons(currentState.currentEventType);
        UI.renderTable();
        
        const resultInputs = document.querySelectorAll('#resultsTable .resultInput');
        resultInputs.forEach(input => {
            const competitorName = input.dataset.name;
            const event = currentState.eventHistory.find(e => e.nr === currentState.eventNumber);
            if (event) {
                const result = event.results.find(r => r.name === competitorName);
                if (result) {
                    input.value = result.result;
                }
            }
        });

        const lastEvent = currentState.eventHistory[currentState.eventHistory.length - 1];
        if (lastEvent && lastEvent.nr === currentState.eventNumber) {
            UI.updateTableWithEventData(lastEvent.results);
            UI.lockResultInputs();
        }
    } else {
        UI.switchView('intro');
        UI.renderCompetitorSelectionUI(State.getAllDbCompetitors());
    }
    UI.setLogoUI(currentState.logoData);
    UI.DOMElements.eventNameInput.value = currentState.eventName || '';
    UI.DOMElements.eventLocationInput.value = currentState.eventLocation || '';
    ActiveActionGuide.update();
}

/**
 * Rejestruje wszystkie detektory zdarzeń (event listeners) dla elementów interfejsu.
 */

// Helper: safely add event listeners if element exists



/* ─────────────────────────────────────────────────────
   EKRAN 2: KOŁO FORTUNY — otwórz po wyborze zawodników
   ───────────────────────────────────────────────────── */
function openDrawView(competitorNames) {
    // Ukryj intro
    const intro = document.getElementById('intro');
    if (intro) intro.style.display = 'none';

    // Pokaż drawView z callbackiem Start → ekran 3
    Draw.openDrawView(competitorNames, (orderedNames) => {
        // Zapisz wylosowaną kolejność do stanu
        State.startCompetition(orderedNames);  // BUG-12 fix: use API not direct mutation

        // Uruchom polling wyników od sędziów pomocniczych
        Judge.startPolling((name, result, judgeLabel) => {
            const input = document.querySelector(`#resultsTable .resultInput[data-name="${CSS.escape(name)}"]`);
            if (input && !input.readOnly) {
                input.value = result;
                input.classList.add('highlight-flash-input');
                UI.showNotification(`⚖️ ${judgeLabel}: ${name} → ${result}`, 'success', 3000);
                setTimeout(() => input.classList.remove('highlight-flash-input'), 1000);
            }
        });
        // Zapisz checkpoint z wylosowaną kolejnością
        const _first = orderedNames[0] || '';
        const _evName2 = State.getEventName() || 'Zawody';
        Persistence.triggerAutoSaveWithContext(`Po losowaniu – start: ${_first}`);
        Persistence.exportStateToFile(`Kolejnosc_startowa_po_losowaniu_${_evName2}`);

        // Ekran 3 – rozgrywka
        UI.switchView('main');
        refreshFullUI();
    });
}


/**
 * Kopiuje tekst do schowka.
 * Safari/iOS wymaga że clipboard.writeText() jest wywołana SYNCHRONICZNIE
 * w handlerze kliknięcia — po każdym await dostęp jest blokowany.
 * Używamy ClipboardItem z Promise (działa synchronicznie w iOS 16.4+)
 * oraz fallbacku przez textarea + execCommand dla starszych.
 */
async function copyToClipboard(text) {
    // Metoda 1: nowoczesne API (Chrome, Firefox, iOS 16.4+)
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_) {}
    }
    // Metoda 2: ClipboardItem z Blob (Safari 13.1+)
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
        try {
            const blob = new Blob([text], { type: 'text/plain' });
            await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
            return true;
        } catch (_) {}
    }
    // Metoda 3: execCommand (fallback dla starszych Safari i WebView)
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        // iOS wymaga zakresu selekcji
        if (navigator.userAgent.match(/ipad|iphone/i)) {
            const range = document.createRange();
            range.selectNodeContents(ta);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            ta.setSelectionRange(0, 999999);
        }
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch (_) {}
    return false;
}

function safeAddListener(id, event, handler) {
    const el = document.getElementById(id);
    if (!el) {
        // element missing — skip and warn
        console.warn('Element with id "' + id + '" not found; skipping listener for ' + event);
        return;
    }
    el.addEventListener(event, handler);
}

function setupCollapsiblePanels() {
    document.querySelectorAll('.collapsible-panel').forEach((panel, index) => {
        const trigger = panel.querySelector('.collapsible-trigger');
        const body = panel.querySelector('.collapsible-body');
        if (!trigger || !body) return;

        const key = panel.dataset.collapsibleKey || `panel-${index}`;
        const storageKey = `s22_collapsible_${key}`;
        const saved = localStorage.getItem(storageKey);
        const defaultCollapsed = panel.dataset.collapsedDefault === 'true';
        const collapsed = saved ? saved === 'collapsed' : defaultCollapsed;

        function applyState(isCollapsed) {
            panel.classList.toggle('is-collapsed', isCollapsed);
            trigger.setAttribute('aria-expanded', String(!isCollapsed));
            body.setAttribute('aria-hidden', String(isCollapsed));
            localStorage.setItem(storageKey, isCollapsed ? 'collapsed' : 'open');
        }

        trigger.addEventListener('click', () => applyState(!panel.classList.contains('is-collapsed')));
        applyState(collapsed);
    });
}

function renderJudgeList() {
    const list = document.getElementById('judgeList');
    if (!list) return;
    const judges = Judge.getJudges();
    if (judges.length === 0) {
        list.innerHTML = '<p style="font-size:0.82rem;color:#999;text-align:center;padding:6px 0 2px;">Brak aktywnych sędziów pomocniczych.</p>';
        return;
    }
    list.innerHTML = judges.map(j => {
        const url = Judge.getJudgeURL(j.token);
        const safeUrl = escapeHTML(url);
        const safeToken = escapeHTML(j.token);
        const safeLabel = escapeHTML(j.label || 'Sędzia');
        const competitorStr = (j.assignedCompetitors || []).length > 0
            ? j.assignedCompetitors.join(', ')
            : 'wszyscy zawodnicy';
        const safeCompetitorStr = escapeHTML(competitorStr);
        return `<div style="background:#f8f9fa;border-radius:10px;padding:10px 12px;border:1px solid #dce0e6;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                <div style="flex:1;min-width:0;">
                    <div style="font-size:0.95rem;font-weight:700;color:#1a2942;">${safeLabel}</div>
                    <div style="font-size:0.75rem;color:#888;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${safeCompetitorStr}</div>
                </div>
                <div style="display:flex;gap:5px;flex-shrink:0;align-items:center;">
                    <button data-open-judge="${safeUrl}" data-token="${safeToken}"
                        title="Otwórz panel sędziego w nowym oknie"
                        style="padding:6px 10px;font-size:0.8rem;width:auto;margin:0;background:linear-gradient(135deg,#27ae60,#1e8449);">
                        📱 Otwórz
                    </button>
                    <button data-copy-url="${safeUrl}"
                        title="Skopiuj link do schowka"
                        style="padding:6px 10px;font-size:0.8rem;width:auto;margin:0;background:linear-gradient(135deg,#2980b9,#1a6fa0);">
                        🔗 Link
                    </button>
                    <button data-revoke-token="${safeToken}"
                        title="Usuń token sędziego"
                        style="padding:6px 8px;font-size:0.8rem;width:auto;margin:0;background:linear-gradient(135deg,#c0392b,#922b21);">
                        🗑
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}

/**
 * Pokazuje modal z linkiem sędziego — zawsze widoczny, możliwy do ręcznego kopiowania.
 * Na iPadzie gdzie schowek nie działa automatycznie, sędzia może zaznacz i skopiuj ręcznie.
 */
function showJudgeLinkDialog(label, url, copied, modeLabel) {
    // Usuń poprzedni dialog jeśli istnieje
    const old = document.getElementById('judgeLinkDialog');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'judgeLinkDialog';
    overlay.style.cssText = [
        'position:fixed;inset:0;z-index:9999',
        'background:rgba(0,0,0,0.65)',
        'display:flex;align-items:center;justify-content:center',
        'padding:16px'
    ].join(';');

    const copiedMsg = copied
        ? '<p style="color:#27ae60;font-weight:700;margin:0 0 12px;">✅ Link skopiowany do schowka!</p>'
        : '<p style="color:#e67e22;font-weight:700;margin:0 0 12px;">⚠️ Nie udało się skopiować automatycznie — zaznacz i skopiuj ręcznie:</p>';
    const safeLabel = escapeHTML(label);
    const safeUrl = escapeHTML(url);
    const safeModeLabel = escapeHTML(modeLabel);

    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:22px 20px;max-width:480px;width:100%;
                  box-shadow:0 12px 40px rgba(0,0,0,0.3);font-family:sans-serif;">
        <h3 style="margin:0 0 8px;color:#1a2942;font-size:1.1rem;">
          🔑 Link dla sędziego ${safeModeLabel}
        </h3>
        <p style="font-size:0.85rem;color:#666;margin:0 0 14px;">
          Sędzia: <strong>${safeLabel}</strong>
        </p>
        ${copiedMsg}
        <div style="position:relative;margin-bottom:16px;">
          <textarea id="judgeLinkText" readonly
            style="width:100%;padding:12px;font-size:0.85rem;border:2px solid #2980b9;
                   border-radius:10px;background:#f0f8ff;color:#1a2942;
                   font-family:monospace;resize:none;height:80px;
                   word-break:break-all;-webkit-user-select:all;user-select:all;"
          >${safeUrl}</textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <button id="judgeLinkCopyBtn"
            style="padding:13px;font-size:1rem;font-weight:700;background:linear-gradient(135deg,#2980b9,#1a6fa0);
                   color:#fff;border:none;border-radius:10px;cursor:pointer;">
            📋 Kopiuj link
          </button>
          <button id="judgeLinkShareBtn"
            style="padding:13px;font-size:1rem;font-weight:700;background:linear-gradient(135deg,#27ae60,#1e8449);
                   color:#fff;border:none;border-radius:10px;cursor:pointer;">
            📤 Udostępnij
          </button>
        </div>
        <button id="judgeLinkCloseBtn"
          style="margin-top:12px;width:100%;padding:11px;font-size:0.95rem;font-weight:600;
                 background:#f0f2f5;color:#555;border:none;border-radius:10px;cursor:pointer;">
          ✕ Zamknij
        </button>
      </div>`;

    document.body.appendChild(overlay);

    // Automatycznie zaznacz tekst w textarea
    const ta = document.getElementById('judgeLinkText');
    if (ta) {
        setTimeout(() => {
            ta.focus();
            ta.select();
            try { ta.setSelectionRange(0, 99999); } catch(_) {}
        }, 100);
    }

    // Przycisk kopiuj
    document.getElementById('judgeLinkCopyBtn').addEventListener('click', async () => {
        const ok = await copyToClipboard(url);
        // Fallback: zaznacz textarea
        if (!ok && ta) {
            ta.focus();
            ta.select();
            try { ta.setSelectionRange(0, 99999); } catch(_) {}
            document.execCommand('copy');
        }
        document.getElementById('judgeLinkCopyBtn').textContent = '✅ Skopiowano!';
    });

    // Web Share API — idealne dla iOS Safari
    const shareBtn = document.getElementById('judgeLinkShareBtn');
    if (navigator.share) {
        shareBtn.addEventListener('click', async () => {
            try {
                await navigator.share({
                    title: `Panel sędziego — ${label}`,
                    text: `Link do panelu sędziego pomocniczego (${label}):`,
                    url: url
                });
            } catch(e) {
                if (e.name !== 'AbortError') {
                    UI.showNotification('Nie można udostępnić — skopiuj link ręcznie.', 'error');
                }
            }
        });
    } else {
        // Brak Web Share API — zmień na "Otwórz"
        shareBtn.textContent = '🔗 Otwórz';
        shareBtn.addEventListener('click', () => { window.open(url, '_blank'); });
    }

    // Zamknij
    document.getElementById('judgeLinkCloseBtn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function setupEventListeners() {
    Stopwatch.setupStopwatchEventListeners();
    FocusMode.setupFocusModeEventListeners();
    Draw.setupDrawListeners();
    
    // --- General UI & Meta ---
    safeAddListener('themeSelector','change', Handlers.handleThemeChange);
    safeAddListener('selectLogoBtn','click', () => document.getElementById('logoUpload').click());
    safeAddListener('logoUpload','change', Handlers.handleLogoUpload);
    safeAddListener('logoImg','dblclick', Handlers.handleRemoveLogo);
    safeAddListener('eventNameInput','input', (e) => {
        State.setEventName(e.target.value);
        History.saveToUndoHistory(State.getState());
        Persistence.triggerAutoSave();
    });
    safeAddListener('eventLocationInput','input', (e) => {
        State.setEventLocation(e.target.value);
        History.saveToUndoHistory(State.getState());
        Persistence.triggerAutoSave();
    });
    safeAddListener('eventTitle','input', (e) => {
        State.setEventTitle(e.target.textContent);
        History.saveToUndoHistory(State.getState());
        Persistence.triggerAutoSave();
    });

    // --- Intro Screen ---
    // Przycisk "Wybierz Konkurencje i Startuj" — otwiera modal wyboru kolejności
    safeAddListener('selectEventsForCompetitionBtn','click', async () => {
        await EventsSelector.openEventsSelector();
    });

    // Przyciski wewnątrz modalu wyboru konkurencji
    safeAddListener('eventsSelectAllBtn',   'click', () => EventsSelector.selectAll());
    safeAddListener('eventsDeselectAllBtn', 'click', () => EventsSelector.deselectAll());
    safeAddListener('selectEventsCancelBtn','click', () => EventsSelector.closeEventsSelector());

    safeAddListener('selectEventsConfirmBtn','click', () => {
        const chosen = EventsSelector.getSelectedEventsOrdered();
        if (!chosen || chosen.length === 0) {
            UI.showNotification('Wybierz co najmniej jedną konkurencję.', 'error');
            return;
        }
        // Zapisz listę wybranych konkurencji w stanie
        State.setPlannedEvents(chosen);
        EventsSelector.closeEventsSelector();

        // Teraz uruchom standardowy start zawodów
        if (Handlers.handleStartCompetition()) {
            // Ustaw pierwszą konkurencję
            const first = chosen[0];
            if (first) {
                State.setEventTitle(first.name);
                document.getElementById('eventTitle').textContent = first.name;
                State.setEventType(first.type);
                UI.updateEventTypeButtons(first.type);
            }
            openDrawView(State.getActiveCompetitors());
        }
    });
    // Live preview zdjęcia po wyborze pliku — konwertuje do JFIF 120x120 i pokazuje podgląd
    safeAddListener('competitorPhotoInput', 'change', async (e) => {
        const file = e.target.files[0];
        const wrap = document.getElementById('photoPreviewWrap');
        const img  = document.getElementById('photoPreviewImg');
        if (!file || !wrap || !img) return;
        try {
            const dataUrl = await CompetitorDB.toJfif120(file);
            img.src = dataUrl;
            wrap.style.display = 'block';
        } catch (err) {
            console.warn('Photo preview error:', err);
            wrap.style.display = 'none';
        }
    });

    safeAddListener('categoryFilters','click', Handlers.handleFilterChange);
    safeAddListener('competitorSelectionList','change', Handlers.handleSelectionChange);

    // --- Wyniki: panel edycji zakończonych konkurencji ---
    safeAddListener('showResultsBtn', 'click', UI.toggleHistoryPanel);
    safeAddListener('nextEventBtn','click', async () => {
        if (await Handlers.handleNextEvent()) {
            signalNext(); VIB.next();
            refreshFullUI();
            LiveDisplay.publishState();
            ActiveActionGuide.update();
            Judge.refreshAllSessions(
                State.getActiveCompetitors(),
                State.getEventTitle(),
                State.getEventType()
            );
        }
    });
    safeAddListener('finalEventBtn','click', async () => {
        if (await Handlers.handleFinalEvent()) {
            signalFanfare(); VIB.fanfare();
            confettiBurst(32);
            refreshFullUI();
            LiveDisplay.publishState();
            ActiveActionGuide.update();
            Judge.refreshAllSessions(
                State.getActiveCompetitors(),
                State.getEventTitle(),
                State.getEventType()
            );
        }
    });
    safeAddListener('calculatePointsBtn','click', async () => {
        if (await Handlers.handleCalculatePoints()) {
            signalPoints(); VIB.save();
            confettiBurst(16);
            refreshFullUI();
            LiveDisplay.publishState();
            ActiveActionGuide.update();
            Judge.refreshAllSessions(
                State.getActiveCompetitors(),
                State.getEventTitle(),
                State.getEventType()
            );
        }
    });
    safeAddListener('showFinalSummaryBtn','click', () => {
        const main    = document.getElementById('mainContent');
        const summary = document.getElementById('summaryView');
        const nameEl  = document.getElementById('summaryEventName');
        if (main)    main.style.display    = 'none';
        if (summary) summary.style.display = 'block';
        if (nameEl)  nameEl.textContent    = State.getEventName() || 'Podsumowanie';
        // Renderuj klasyfikację końcową i szczegółowe podsumowanie
        UI.renderFinalSummary();
        // Przewiń na górę ekranu podsumowania
        summary.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    // Wróć do zawodów z ekranu Podsumowania
    // Kliknięcie na przycisk edycji konkurencji w historii
    safeAddListener('summaryEventList','click', (e) => {
        const btn = e.target.closest('button[data-event-id]');
        if (btn) UI.renderEventForEditing(parseInt(btn.dataset.eventId, 10));
    });
    // Zapisz i Przelicz w formularzu edycji
    safeAddListener('summaryEventDetails','click', async (e) => {
        const btn = e.target.closest('[data-action="save-recalculate"]');
        if (btn && await Handlers.handleSaveAndRecalculate(parseInt(btn.dataset.eventId, 10))) {
            UI.renderFinalSummary();
        }
    });
    safeAddListener('summaryBackBtn','click', () => {
        const main = document.getElementById('mainContent');
        const summary = document.getElementById('summaryView');
        if (summary) summary.style.display = 'none';
        if (main)    main.style.display    = 'block';
    });
    // Telebim z ekranu Podsumowania (osobne ID żeby uniknąć duplikatu)
    safeAddListener('openLiveDisplayBtn2','click', () => {
        LiveDisplay.publishState();
        const url = LiveDisplay.getLiveURL();
        const win = window.open(url, 'strongman-live', 'width=1280,height=720,menubar=no,toolbar=no');
        if (!win) { try { navigator.clipboard.writeText(url); } catch(_) {} UI.showNotification('Link skopiowany!','info'); }
    });
    safeAddListener('highTypeBtn','click', async () => {
        await Handlers.handleEventTypeChange('high');
        ActiveActionGuide.update();
    });
    safeAddListener('lowTypeBtn','click', async () => {
        await Handlers.handleEventTypeChange('low');
        ActiveActionGuide.update();
    });
    safeAddListener('toggleTableWidthBtn','click', (e) => {
        const wrapper = document.querySelector('.table-wrapper');
        wrapper.classList.toggle('expanded');
        e.target.textContent = wrapper.classList.contains('expanded') ? 'Zwiń Tabelę' : 'Rozwiń Tabelę';
    });

    // --- Table & Main Content Clicks ---
    safeAddListener('mainContent','click', (e) => {
        const target = e.target;
        const action = target.dataset.action;
        const competitorName = target.closest('tr')?.dataset.name;

        if (target.closest('.tie-info')) {
            target.closest('.tie-info').classList.toggle('tooltip-active');
        } else if (action === 'showDetails' && competitorName) {
            UI.showCompetitorDetails(State.getCompetitorProfile(competitorName));
        } else if(action === 'openStopwatch' && competitorName) {
            const currentEventTitle = State.getEventTitle?.() || document.getElementById('eventTitle')?.textContent || '';
            Stopwatch.enterStopwatch(competitorName, Handlers.handleStopwatchSave, currentEventTitle);
        } else if (target.classList.contains('resultInput') && !target.readOnly) {
            FocusMode.handleEnterFocusMode(target.dataset.name);
        }
    });
    
    // --- POPRAWKA: Precyzyjny zapis po każdej zmianie w polu wyniku ---
    safeAddListener('resultsTable','change', (e) => {
        if (e.target.classList.contains('resultInput')) {
            History.saveToUndoHistory(State.getState());
            Persistence.triggerAutoSave();
            e.target.classList.add('highlight-flash-input');
            setTimeout(() => e.target.classList.remove('highlight-flash-input'), 1000);
            // Timeline: po wpisaniu wyniku pokaż co nacisnąć dalej
            ActiveActionGuide.update();
        }
    });

    safeAddListener('resultsTable','input', (e) => {
        if (e.target.classList.contains('resultInput')) ActiveActionGuide.update();
    });
    document.addEventListener('strongman:result-updated', () => ActiveActionGuide.update());

    // --- History & Editing (obsługiwane już powyżej przez summaryEventList/summaryEventDetails) ---
    safeAddListener('undoBtn','click', () => {
        if (Handlers.handleUndo()) {
            refreshFullUI();
            ActiveActionGuide.update();
        }
    });
    safeAddListener('redoBtn','click', () => {
        if (Handlers.handleRedo()) {
            refreshFullUI();
            ActiveActionGuide.update();
        }
    });

    // --- Databases & Modals ---
    safeAddListener('manageDbBtn','click', Handlers.handleManageCompetitors);
    safeAddListener('closeDbPanelBtn','click', () => document.getElementById('competitorDbPanel').classList.remove('visible'));
    safeAddListener('exportDbBtn','click', CompetitorDB.exportCompetitorsToJson);
    safeAddListener('importDbTrigger','click', () => document.getElementById('importDbFile').click());
    safeAddListener('importDbFile','change', async (e) => {
        // NIE używamy setUIBlocked — blokuje przyciski modali i powoduje zawieszenie
        const file = e.target.files[0];
        e.target.value = null;
        await Handlers.handleDbFileImport(file);
    });
    safeAddListener('competitorForm','submit', Handlers.handleCompetitorFormSubmit);
    safeAddListener('competitorListContainer','click', Handlers.handleCompetitorListAction);
    
    safeAddListener('manageEventsDbBtn','click', Handlers.handleManageEvents);
    safeAddListener('eventForm','submit', Handlers.handleEventFormSubmit);
    safeAddListener('eventListContainer','click', Handlers.handleEventListAction);
    safeAddListener('closeEventDbPanelBtn','click', () => document.getElementById('eventDbPanel').classList.remove('visible'));
    safeAddListener('exportEventsDbBtn','click', EventsDB.exportEventsToJson);
    safeAddListener('importEventsDbTrigger','click', () => document.getElementById('importEventsDbFile').click());
    safeAddListener('importEventsDbFile','change', async (e) => {
        // NIE używamy setUIBlocked — blokuje przyciski modali i powoduje zawieszenie
        const file = e.target.files[0];
        e.target.value = null;
        await Handlers.handleEventsDbFileImport(file);
    });

    // ═══════════════════════════════════════════════════════
    // SĘDZIOWIE POMOCNICZY
    // Flow: ➕ Dodaj → formularz → ✓ Utwórz i wyślij link
    //   → token zapisany, link skopiowany + okno judge.html otwarte
    // ═══════════════════════════════════════════════════════

    // Zwiń/rozwiń panel sędziów
    safeAddListener('judgePanelToggle', 'click', () => {
        const body = document.getElementById('judgePanelBody');
        const chevron = document.getElementById('judgePanelChevron');
        if (!body) return;
        const collapsed = body.style.display === 'none';
        body.style.display = collapsed ? 'block' : 'none';
        if (chevron) chevron.style.transform = collapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
    });

    // ➕ Dodaj Sędziego — pokaż formularz z checkboxami zawodników
    safeAddListener('createJudgeTokenBtn', 'click', () => {
        const form = document.getElementById('newJudgeForm');
        if (!form) return;
        const isVisible = form.style.display !== 'none';
        if (isVisible) { form.style.display = 'none'; return; }

        // Wypełnij checkboxy zawodnikami
        const checkboxContainer = document.getElementById('judgeCompetitorCheckboxes');
        const competitors = State.getActiveCompetitors() || [];
        if (checkboxContainer) {
            if (competitors.length === 0) {
                checkboxContainer.innerHTML = '<p style="font-size:0.82rem;color:#888;">Brak zawodników — zawody nie zostały jeszcze rozpoczęte.</p>';
            } else {
                checkboxContainer.innerHTML = competitors.map(name => `
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.9rem;padding:4px 0;">
                        <input type="checkbox" value="${escapeHTML(name)}" checked style="width:auto;margin:0;cursor:pointer;">
                        <span>${escapeHTML(name)}</span>
                    </label>
                `).join('');
            }
        }
        document.getElementById('judgeLabelInput').value = `Sędzia ${Judge.getJudges().length + 1}`;
        form.style.display = 'block';
        document.getElementById('judgeLabelInput').focus();
    });

    // ✕ Anuluj formularz
    safeAddListener('cancelCreateJudgeBtn', 'click', () => {
        document.getElementById('newJudgeForm').style.display = 'none';
    });

    // ✓ Utwórz Token i OTWÓRZ judge.html z tokenem w URL
    safeAddListener('confirmCreateJudgeBtn', 'click', async () => {
        const labelInput = document.getElementById('judgeLabelInput');
        const label = labelInput?.value?.trim();
        if (!label) {
            UI.showNotification('Podaj opis sędziego.', 'error');
            labelInput?.focus();
            return;
        }

        // Zbierz zaznaczonych zawodników
        const checked = document.querySelectorAll('#judgeCompetitorCheckboxes input:checked');
        const allCompetitors = State.getActiveCompetitors() || [];
        const assignedCompetitors = checked.length > 0
            ? Array.from(checked).map(cb => cb.value)
            : allCompetitors;

        // Upewnij się że sesja jest aktywna (synchronicznie jeśli możliwe)
        await Judge.initSession();
        const token = await Judge.createJudgeToken(label, assignedCompetitors);
        const url   = Judge.getJudgeURL(token);

        // ── Kopiowanie do schowka ──
        // WAŻNE: na iOS/Safari clipboard musi być wywołany w tym samym ticku co kliknięcie.
        // Używamy naszego copyToClipboard() który ma fallback przez textarea+execCommand.
        const copied = await copyToClipboard(url);

        // ── Otwórz panel sędziego ──
        // Na iPadzie window.open() może być zablokowane — obsługujemy oba przypadki.
        const win = window.open(url, `judge_${token}`,
            'width=420,height=780,menubar=no,toolbar=no,location=no,scrollbars=yes');

        const modeLabel = Judge.isOnlineMode() ? '🌐' : '📱';

        // ── Pokaż dialog z linkiem — zawsze, niezależnie od schowka ──
        // Dzięki temu sędzia zawsze może ręcznie skopiować link
        showJudgeLinkDialog(label, url, copied, modeLabel);

        // Ukryj formularz i odśwież listę
        const form = document.getElementById('newJudgeForm');
        if (form) form.style.display = 'none';
        if (labelInput) labelInput.value = '';
        renderJudgeList();
    });

    // Delegacja kliknięć w liście sędziów: Otwórz ponownie | Kopiuj link | Usuń
    safeAddListener('judgeList', 'click', async (e) => {
        const openBtn   = e.target.closest('[data-open-judge]');
        const copyBtn   = e.target.closest('[data-copy-url]');
        const revokeBtn = e.target.closest('[data-revoke-token]');

        if (openBtn) {
            const url = openBtn.dataset.openJudge;
            const token = openBtn.dataset.token;
            const win = window.open(url, `judge_${token}`, 'width=420,height=780,menubar=no,toolbar=no,location=no');
            if (!win) {
                try { navigator.clipboard.writeText(url); } catch(_) {}
                UI.showNotification('Popup zablokowany — link skopiowany do schowka!', 'info', 4000);
            }
        } else if (copyBtn) {
            const url = copyBtn.dataset.copyUrl;
            const label = copyBtn.dataset.label || 'Sędzia';
            copyToClipboard(url).then(copied => {
                showJudgeLinkDialog(label, url, copied, '');
            });
        } else if (revokeBtn) {
            if (!await UI.showConfirmation(
                'Usunac token sedziego pomocniczego?\n\n' +
                'Ten telefon straci mozliwosc wysylania wynikow.'
            )) return;
            Judge.revokeJudge(revokeBtn.dataset.revokeToken);
            renderJudgeList();
            UI.showNotification('Token sędziego usunięty.', 'info', 2000);
        }
    });

    safeAddListener('selectEventFromDbBtn','click', Handlers.handleSelectEventFromDb);
    safeAddListener('selectEventList','click', Handlers.handleEventSelection);
    safeAddListener('selectEventCancelBtn','click', () => document.getElementById('selectEventModal').classList.remove('visible'));
    safeAddListener('competitorDetailCloseBtn','click', () => document.getElementById('competitorDetailModal').classList.remove('visible'));

    // --- Persistence & Export ---
    safeAddListener('openLiveDisplayBtn','click', () => {
        LiveDisplay.publishState();
        const url = LiveDisplay.getLiveURL();
        const win = window.open(url, 'strongman-live', 'width=1280,height=720,menubar=no,toolbar=no');
        if (!win) {
            // Popup zablokowany — pokaż URL
            const msg = `Otwórz ręcznie w przeglądarce:\n${url}`;
            UI.showNotification('Otwórz telebim ręcznie — link skopiowany!', 'info');
            try { navigator.clipboard.writeText(url); } catch(_) {}
        }
    });
    safeAddListener('exportHtmlBtn','click', Handlers.handleExportHtml);
    safeAddListener('resetCompetitionBtn','click', () => Persistence.resetApplication(refreshFullUI));
    safeAddListener('saveCheckpointBtn','click', () => Persistence.saveCheckpoint());
    // Punkty kontrolne też w panelu "Zabezpieczenia przed startem" (intro)
    safeAddListener('saveCheckpointBtn_intro','click', () => Persistence.saveCheckpoint());
    safeAddListener('showCheckpointsBtn_intro','click', () => {
        // Pokaż listę w panelu intro
        Persistence.handleShowCheckpoints('checkpointListContainer_intro','checkpointList_intro');
    });
    safeAddListener('checkpointList_intro','click', (e) => {
        Persistence.handleCheckpointListActions(e, refreshFullUI);
    });
    safeAddListener('showCheckpointsBtn','click', () => Persistence.handleShowCheckpoints());
    safeAddListener('checkpointList','click', (e) => Persistence.handleCheckpointListActions(e, refreshFullUI));
    safeAddListener('exportStateBtn_main','click', () => Persistence.exportStateToFile());
    safeAddListener('importStateBtn_main','click', () => document.getElementById('importFile_main').click());
    safeAddListener('importFile_main','change', async (e) => {
        const file = e.target.files[0];
        e.target.value = null;
        // NIE używamy setUIBlocked — showConfirmation wewnątrz byłoby zablokowane
        await Handlers.handleImportState(file, refreshFullUI);
    });
    safeAddListener('exportStateBtn_intro','click', () => Persistence.exportStateToFile('Stan_przed_startem'));
    safeAddListener('importStateBtn_intro','click', () => document.getElementById('importFile_intro').click());
    safeAddListener('importFile_intro','change', async (e) => {
        const file = e.target.files[0];
        e.target.value = null;
        await Handlers.handleImportState(file, refreshFullUI);
    });

}

/**
 * Główna funkcja inicjalizująca aplikację.
 */
async function initializeApp() {
    try {
        UI.initUI();
        setupCollapsiblePanels();
        // DODANA LINIA - Inicjalizujemy nasz nowy prompter, aby był gotowy do użycia
        UI.initFullscreenPrompter();
        // Inicjalizacja audio — odblokowanie AudioContext przy pierwszej interakcji
        Stopwatch.initAudio();
        Stopwatch.initStopwatch();
        
        await CompetitorDB.initDB();
    // Events DB initialization/cleanup
    if (AppConfig.CLEAR_EVENTS_ON_INIT) {
      try {
        await EventsDB.clearEventsDatabase();
      } catch (err) {
        console.warn('Could not clear events DB on init:', err);
      }
    }
    try {
      await EventsDB.seedEventsDatabaseIfNeeded();
    } catch (err) {
      console.error('Error seeding events DB:', err);
    }
        // Events DB now unified under Dexie (db-dexie). No separate init necessary.
        await CheckpointsDB.initCheckpointsDB();
        
        await CompetitorDB.seedCompetitorsDatabaseIfNeeded();
        
        setupEventListeners();
        // --- Autosave toggle wiring ---
        try {
            const autosaveToggle = document.getElementById('autosaveToggle');
            if (autosaveToggle) {
                autosaveToggle.checked = Persistence.isAutosaveEnabled();
                autosaveToggle.addEventListener('change', (e) => {
                    Persistence.setAutosaveEnabled(e.target.checked);
                    UI.showNotification('Autozapisy ' + (e.target.checked ? 'włączone' : 'wyłączone'), 'info', 1200);
                });
            }
        } catch(err) {
            console.warn('Autosave toggle init failed', err);
        }



        const savedTheme = Persistence.loadTheme();
        document.body.className = savedTheme;
        UI.DOMElements.themeSelector.value = savedTheme;

        const loadedFromAutoSave = await Persistence.loadStateFromAutoSave();
        if (loadedFromAutoSave) {
            refreshFullUI();
        } else {
            await Handlers.loadAndRenderInitialData();
            State.setEventName(UI.DOMElements.eventNameInput.value);
        }
        History.clearHistory();
        History.saveToUndoHistory(State.getState());
        LiveDisplay.init();
        await Judge.initSession();
        // Zaktualizuj wskaźnik trybu w panelu sędziów
        try {
            const modeIcon = document.getElementById('judgeModeIcon');
            const modeText = document.getElementById('judgeModeText');
            const indicator = document.getElementById('judgeModeIndicator');
            if (modeIcon && modeText && indicator) {
                if (Judge.isOnlineMode()) {
                    modeIcon.textContent = '🌐';
                    modeText.textContent = 'Firebase aktywny — sędziowie mogą działać z dowolnego miejsca przez internet';
                    indicator.style.background = '#e8f5e9';
                    indicator.style.color = '#2e7d32';
                } else {
                    modeIcon.textContent = '📱';
                    modeText.textContent = 'Tryb lokalny — uzupełnij konfigurację Firebase w js/judge.js aby włączyć tryb online';
                    indicator.style.background = '#fff3e0';
                    indicator.style.color = '#e65100';
                }
            }
        } catch(_) {}
        UI.showNotification("Aplikacja gotowa!", "success", 2000);
    } catch (error) {
        console.error("Krytyczny błąd podczas inicjalizacji:", error);
        UI.showNotification("Wystąpił błąd krytyczny. Odśwież stronę.", "error", 10000);
    }
}

// Uruchomienie aplikacji po załadowaniu drzewa DOM
document.addEventListener('DOMContentLoaded', initializeApp);
