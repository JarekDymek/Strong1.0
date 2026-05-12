// js/utils.js — wspólne funkcje pomocnicze

/**
 * Usuwa z obiektu wszystko czego IndexedDB nie może serializować:
 * węzły DOM, obiekty Event, funkcje, cykliczne referencje.
 * Używane przed zapisem do IDB (autosave, checkpointy).
 */
export function sanitizeForIDB(obj, _seen = new WeakSet()) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return (typeof obj === 'function') ? undefined : obj;
    if (_seen.has(obj)) return undefined;
    _seen.add(obj);
    if (typeof Node !== 'undefined' && obj instanceof Node) return undefined;
    if (typeof Event !== 'undefined' && obj instanceof Event) return undefined;
    if (Array.isArray(obj)) {
        return obj.map(i => sanitizeForIDB(i, _seen)).filter(i => i !== undefined);
    }
    const out = {};
    for (const k of Object.keys(obj)) {
        try {
            const v = obj[k];
            if (typeof v === 'function') continue;
            if (v && typeof v === 'object' && (v.nodeType || v instanceof Event)) continue;
            const sv = sanitizeForIDB(v, _seen);
            if (sv !== undefined) out[k] = sv;
        } catch (_) { continue; }
    }
    return out;
}

/**
 * Bezpieczna wersja parseFloat — zwraca 0 zamiast NaN.
 */
export function safeParseFloat(val) {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
}

/**
 * Escapes text before it is interpolated into HTML templates.
 */
export function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[char]));
}
