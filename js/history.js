// Plik: js/history.js
// Cel: Zarządza stosami Undo/Redo.

let undoStack = [];
let redoStack = [];
const MAX_HISTORY_SIZE = 50;

function setBtn(id, disabled) {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
}

export function saveToUndoHistory(currentState) {
    if (undoStack.length > 0 &&
        JSON.stringify(undoStack[undoStack.length - 1]) === JSON.stringify(currentState)) {
        return;
    }
    redoStack = [];
    setBtn('redoBtn', true);
    undoStack.push(JSON.parse(JSON.stringify(currentState)));
    if (undoStack.length > MAX_HISTORY_SIZE) undoStack.shift();
    setBtn('undoBtn', undoStack.length === 0);
}

export function undo(currentState) {
    if (undoStack.length === 0) return null;
    redoStack.push(JSON.parse(JSON.stringify(currentState)));
    setBtn('redoBtn', false);
    const previousState = undoStack.pop();
    setBtn('undoBtn', undoStack.length === 0);
    return previousState;
}

export function redo(currentState) {
    if (redoStack.length === 0) return null;
    undoStack.push(JSON.parse(JSON.stringify(currentState)));
    setBtn('undoBtn', false);
    const nextState = redoStack.pop();
    setBtn('redoBtn', redoStack.length === 0);
    return nextState;
}

export function clearHistory() {
    undoStack = [];
    redoStack = [];
    setBtn('undoBtn', true);
    setBtn('redoBtn', true);
}
