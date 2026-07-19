import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './harness.mjs';

const TIMER_KEY = 'puffin-feeding-timer';

// getTimerState reads the running feeding timer out of localStorage. It runs
// first in initTimer, which is early in the DOMContentLoaded bootstrap, so a
// throw here takes the whole page down (bug #13).

test('no stored timer returns null', () => {
    const app = loadApp();
    assert.equal(app.fns.getTimerState(), null);
});

test('a well-formed timer round-trips', () => {
    const state = {
        active: true,
        childId: 3,
        segments: [{ side: 'breast_left', startTime: '2026-07-19T10:00:00Z', endTime: null }],
    };
    const app = loadApp({ localStorage: { [TIMER_KEY]: JSON.stringify(state) } });
    assert.deepEqual(app.fns.getTimerState(), state);
});

// Bug #13: a truncated or corrupt write must not throw -- it would abort the
// bootstrap and leave a dead page that survives reloads. It must be discarded.
test('corrupt JSON is discarded, not thrown', () => {
    const app = loadApp({ localStorage: { [TIMER_KEY]: '{"active":true,"segments":[{"side"' } });

    let result;
    assert.doesNotThrow(() => {
        result = app.fns.getTimerState();
    });
    assert.equal(result, null);
    // And the unreadable value is cleared so it can't wedge the next load.
    assert.equal(app.localStorage.getItem(TIMER_KEY), null);
    assert.equal(app.consoleErrors.length, 1, 'the discard is logged');
});

test('a totally garbage value is also discarded', () => {
    const app = loadApp({ localStorage: { [TIMER_KEY]: 'not json at all' } });
    assert.equal(app.fns.getTimerState(), null);
    assert.equal(app.localStorage.getItem(TIMER_KEY), null);
});

// The pre-switching format (a single side/startTime instead of segments) is
// migrated in place. Locks that the corrupt-JSON guard didn't disturb it.
test('the legacy single-side format migrates to segments', () => {
    const legacy = { active: true, side: 'breast_right', startTime: '2026-07-19T09:00:00Z' };
    const app = loadApp({ localStorage: { [TIMER_KEY]: JSON.stringify(legacy) } });

    const state = app.fns.getTimerState();
    assert.ok(Array.isArray(state.segments), 'segments array is created');
    assert.equal(state.segments.length, 1);
    assert.equal(state.segments[0].side, 'breast_right');
    assert.equal(state.segments[0].startTime, '2026-07-19T09:00:00Z');
    assert.equal(state.side, undefined, 'old flat fields are removed');
    assert.equal(state.startTime, undefined);

    // The migration is persisted, so the next read sees the new shape directly.
    assert.deepEqual(JSON.parse(app.localStorage.getItem(TIMER_KEY)), state);
});
