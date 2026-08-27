import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './harness.mjs';

// planBreastEdit turns "what the two duration fields now hold" into what should
// happen to the records behind them. The breast edit form has no type selector,
// so this comparison is the only thing that distinguishes a duration tweak from
// moving a feed to the other side, adding a side to a session that ended early,
// or dropping one side of a pair.

const { fns } = loadApp();
const plan = (before, after) => fns.planBreastEdit(before, after);

const left = (id, mins) => ({ id, feeding_type: 'breast_left', duration_minutes: mins });
const right = (id, mins) => ({ id, feeding_type: 'breast_right', duration_minutes: mins });
const only = (record) =>
    record.feeding_type === 'breast_left'
        ? { breast_left: record, breast_right: null }
        : { breast_left: null, breast_right: record };
const pair = (l, r) => ({ breast_left: l, breast_right: r });

test('clearing every side is refused rather than deleting the session', () => {
    const result = plan(only(left(1, 15)), { breast_left: '', breast_right: '' });
    assert.equal(result.action, 'empty');
});

test('changing a duration on the side it was logged on is a plain update', () => {
    const result = plan(only(left(1, 15)), { breast_left: '20', breast_right: '' });
    assert.equal(result.action, 'update');
    assert.deepEqual(result.updates, [{ id: 1, duration_minutes: 20 }]);
});

test('an unchanged duration produces no writes', () => {
    const result = plan(only(left(1, 15)), { breast_left: '15', breast_right: '' });
    assert.equal(result.action, 'update');
    assert.deepEqual(result.updates, []);
});

test('moving a lone feed to the other side flips the record in place', () => {
    const result = plan(only(left(1, 15)), { breast_left: '', breast_right: '15' });
    assert.equal(result.action, 'flip');
    // The same record id: a mis-tapped side is a correction, not a re-log.
    assert.equal(result.id, 1);
    assert.equal(result.toSide, 'breast_right');
    assert.equal(result.duration_minutes, 15);
});

test('a flip may change the duration at the same time', () => {
    const result = plan(only(right(7, 9)), { breast_left: '12', breast_right: '' });
    assert.equal(result.action, 'flip');
    assert.equal(result.id, 7);
    assert.equal(result.toSide, 'breast_left');
    assert.equal(result.duration_minutes, 12);
});

test('filling the empty side of a single-sided session pairs it', () => {
    const result = plan(only(left(1, 15)), { breast_left: '15', breast_right: '8' });
    assert.equal(result.action, 'pair');
    assert.equal(result.pairId, 1);
    assert.equal(result.addedSide, 'breast_right');
    assert.equal(result.addedMinutes, 8);
});

test('pairing also carries a duration change to the side already on record', () => {
    const result = plan(only(left(1, 15)), { breast_left: '18', breast_right: '8' });
    assert.equal(result.action, 'pair');
    assert.deepEqual(result.updates, [{ id: 1, duration_minutes: 18 }]);
});

test('editing both sides of a pair is a plain update', () => {
    const result = plan(pair(left(1, 15), right(2, 8)), { breast_left: '16', breast_right: '9' });
    assert.equal(result.action, 'update');
    assert.deepEqual(result.updates, [
        { id: 1, duration_minutes: 16 },
        { id: 2, duration_minutes: 9 },
    ]);
});

test('clearing one side of a pair drops that side and reports what is lost', () => {
    const result = plan(pair(left(1, 15), right(2, 8)), { breast_left: '15', breast_right: '' });
    assert.equal(result.action, 'unpair');
    assert.equal(result.deleteId, 2);
    // The confirmation quotes these back to the caregiver before anything goes.
    assert.equal(result.droppedSide, 'breast_right');
    assert.equal(result.droppedMinutes, 8);
});

test('the side that survives an unpair can be edited in the same save', () => {
    const result = plan(pair(left(1, 15), right(2, 8)), { breast_left: '20', breast_right: '' });
    assert.equal(result.action, 'unpair');
    assert.equal(result.deleteId, 2);
    assert.deepEqual(result.updates, [{ id: 1, duration_minutes: 20 }]);
});

test('blank, zero and junk durations all read as an empty side', () => {
    for (const value of ['', '0', 'abc', '   ']) {
        const result = plan(only(left(1, 15)), { breast_left: '15', breast_right: value });
        assert.equal(result.action, 'update', `expected ${JSON.stringify(value)} to be empty`);
    }
});
