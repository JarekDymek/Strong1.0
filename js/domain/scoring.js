// Pure competition scoring rules. This module has no DOM, storage, or app-state dependencies.

export function parseResult(rawValue, eventType) {
    const valStr = String(rawValue).trim().replace(',', '.').toLowerCase();
    const worstVal = eventType === 'high' ? -Infinity : +Infinity;

    if (valStr === '' || valStr === '0') {
        return { val: worstVal, raw: rawValue, zero: true, dnf: true };
    }

    if (eventType === 'low') {
        if (valStr.includes(':')) {
            const parts = valStr.split(':');
            const minutes = parseFloat(parts[0]);
            const seconds = parseFloat(parts[1]);
            if (!isNaN(minutes) && !isNaN(seconds) && seconds >= 0 && seconds < 60) {
                return { val: minutes * 60 + seconds, raw: rawValue, zero: false, isTime: true };
            }
            return { val: worstVal, raw: rawValue, zero: true, error: true };
        }

        if (valStr.startsWith('0') && valStr.length > 1 && valStr !== '0') {
            const distance = parseFloat(valStr.slice(1));
            if (!isNaN(distance) && distance > 0) {
                return { val: 99000 - distance, raw: rawValue, zero: false, isDist: true, distance };
            }
            return { val: worstVal, raw: rawValue, zero: true, dnf: true };
        }

        const time = parseFloat(valStr);
        if (!isNaN(time) && time > 0) {
            return { val: time, raw: rawValue, zero: false, isTime: true };
        }

        return { val: worstVal, raw: rawValue, zero: true, error: true };
    }

    if (eventType === 'high') {
        const score = parseFloat(valStr);
        if (!isNaN(score) && score > 0) {
            return { val: score, raw: rawValue, zero: false };
        }
        if (!isNaN(score) && score === 0) {
            return { val: worstVal, raw: rawValue, zero: true, dnf: true };
        }
        return { val: worstVal, raw: rawValue, zero: true, error: true };
    }

    return { val: worstVal, raw: rawValue, zero: true };
}

export function calculateEventPoints(currentResults, totalCompetitors, eventType) {
    let hasError = false;

    const parsedResults = currentResults.map(entry => {
        const parsed = parseResult(entry.result, eventType);
        parsed.name = entry.name;
        if (parsed.error === true) hasError = true;
        return parsed;
    });

    if (hasError) {
        return { results: [], error: true };
    }

    parsedResults.sort((a, b) => eventType === 'high' ? b.val - a.val : a.val - b.val);

    const finalEventResults = [];
    for (let i = 0; i < parsedResults.length; ) {
        let j = i;
        while (j < parsedResults.length && parsedResults[j].val === parsedResults[i].val) {
            j++;
        }

        const tiedCount = j - i;
        let sumOfPoints = 0;
        for (let k = i; k < j; k++) {
            if (!parsedResults[k].zero) {
                sumOfPoints += (totalCompetitors - k);
            }
        }

        const averagePoints = tiedCount > 0 ? sumOfPoints / tiedCount : 0;
        for (let k = i; k < j; k++) {
            const p = parsedResults[k];
            let displayResult = p.raw;
            if (p.isDist) {
                displayResult = `DNF+${p.distance}m`;
            } else if (p.dnf && !p.isDist) {
                displayResult = 'DNF';
            }

            finalEventResults.push({
                name: p.name,
                result: displayResult,
                rawInput: p.raw,
                place: p.zero ? '-' : (i + 1),
                points: (p.zero ? 0 : averagePoints).toFixed(2),
                isDist: !!p.isDist,
                isDnf: !!p.dnf,
            });
        }
        i = j;
    }

    return { results: finalEventResults, error: false };
}

export function breakTie(competitorA, competitorB, eventHistory, totalCompetitors) {
    const countPlaces = (name) => {
        const places = Array(totalCompetitors + 1).fill(0);
        eventHistory.forEach(e => {
            const result = e.results.find(w => w.name === name);
            if (result && result.place !== '-') {
                const place = parseInt(result.place, 10);
                if (!isNaN(place)) places[place]++;
            }
        });
        return places;
    };

    const aPlaces = countPlaces(competitorA);
    const bPlaces = countPlaces(competitorB);

    for (let i = 1; i <= totalCompetitors; i++) {
        if (aPlaces[i] !== bPlaces[i]) {
            return { outcome: bPlaces[i] - aPlaces[i], reason: `wiecej ${i}. miejsc` };
        }
    }

    for (let i = eventHistory.length - 1; i >= 0; i--) {
        const ev = eventHistory[i];
        const aResult = ev.results.find(r => r.name === competitorA);
        const bResult = ev.results.find(r => r.name === competitorB);
        if (aResult && bResult) {
            const aPts = parseFloat(aResult.points) || 0;
            const bPts = parseFloat(bResult.points) || 0;
            if (aPts !== bPts) {
                return { outcome: bPts - aPts, reason: `lepszy wynik w konkurencji ${ev.nr}: ${ev.name}` };
            }
        }
    }

    return { outcome: 0, reason: 'Remis nierozstrzygniety' };
}
