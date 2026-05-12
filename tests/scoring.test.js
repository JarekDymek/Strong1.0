import assert from 'node:assert/strict';
import { calculateEventPoints, parseResult, breakTie } from '../js/domain/scoring.js';

{
    const { results, error } = calculateEventPoints([
        { name: 'A', result: '10' },
        { name: 'B', result: '5' },
        { name: 'C', result: '0' },
    ], 3, 'high');

    assert.equal(error, false);
    assert.equal(results[0].name, 'A');
    assert.equal(results[0].points, '3.00');
    assert.equal(results[2].result, 'DNF');
    assert.equal(results[2].points, '0.00');
}

{
    const time = parseResult('1:22.50', 'low');
    const distance = parseResult('018.5', 'low');

    assert.equal(time.val, 82.5);
    assert.equal(distance.isDist, true);
    assert.equal(distance.distance, 18.5);
}

{
    const { results, error } = calculateEventPoints([
        { name: 'A', result: '10' },
        { name: 'B', result: '10' },
    ], 2, 'high');

    assert.equal(error, false);
    assert.equal(results[0].points, '1.50');
    assert.equal(results[1].points, '1.50');
}

{
    const outcome = breakTie('A', 'B', [
        { nr: 1, name: 'Belka', results: [
            { name: 'A', place: 1, points: '2.00' },
            { name: 'B', place: 2, points: '1.00' },
        ] },
    ], 2);

    assert.ok(outcome.outcome < 0);
}

console.log('scoring tests ok');
