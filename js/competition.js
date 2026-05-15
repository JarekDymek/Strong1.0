// Plik: js/competition.js
// Cel: Koordynuje zmiany stanu zawodow; czyste reguly punktacji sa w domain/scoring.js.

import { getState, transitionToFinalEvent } from './state.js';
import { saveToUndoHistory } from './history.js';
import { showConfirmation } from './ui.js';

export { parseResult, calculateEventPoints, breakTie } from './domain/scoring.js';

export async function setupFinalEvent(tieBreaker) {
    saveToUndoHistory(getState());
    transitionToFinalEvent(tieBreaker);
    return true;
}

// Dodano strażnika, który wymaga zgody przed przejściem do następnej konkurencji po finale
export async function guardNextEventAfterFinal() {
    const planned = getState().plannedEvents;
    const currentEventNumber = getState().eventNumber;

    if (planned && currentEventNumber === planned.length) {
        const finalEventData = planned[planned.length - 1];
        const confirmation = await showConfirmation(
            `Zakończono konkurencję finałową: "${finalEventData.name}".\n` +
            `Czy na pewno chcesz przejść do następnej konkurencji?`
        );
        return confirmation;
    }
    return true;
}
