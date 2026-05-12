// Plik: js/competition.js
// Cel: Koordynuje zmiany stanu zawodow; czyste reguly punktacji sa w domain/scoring.js.

import { getState, transitionToFinalEvent } from './state.js';
import { saveToUndoHistory } from './history.js';

export { parseResult, calculateEventPoints, breakTie } from './domain/scoring.js';

export async function setupFinalEvent(tieBreaker) {
    saveToUndoHistory(getState());
    transitionToFinalEvent(tieBreaker);
    return true;
}
