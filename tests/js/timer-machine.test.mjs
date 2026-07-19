import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './harness.mjs';

const TIMER_KEY = 'puffin-feeding-timer';
const NOW = Date.UTC(2026, 6, 19, 12, 0, 0);

// A running session, its single segment started `agoMs` before NOW.
function runningTimer(agoMs, side = 'breast_left') {
    return {
        active: true,
        childId: 1,
        segments: [{ side, startTime: new Date(NOW - agoMs).toISOString(), endTime: null }],
    };
}

function toastText(app) {
    return app.document.getElementById('toast').textContent;
}

// --- #2: starting a timer must not clobber a running session ---

test('startTimer refuses to overwrite an active session', () => {
    const existing = runningTimer(25 * 60000); // 25 minutes in
    const app = loadApp({ dom: true, now: NOW, localStorage: { [TIMER_KEY]: JSON.stringify(existing) } });

    app.fns.startTimer('breast_right'); // the mis-tap

    const after = JSON.parse(app.localStorage.getItem(TIMER_KEY));
    assert.deepEqual(after, existing, 'the in-progress session is untouched');
    assert.equal(after.segments.length, 1, 'no second segment was appended');
    assert.equal(after.segments[0].side, 'breast_left', 'the original side is preserved');
    assert.equal(toastText(app), 'A feeding is already in progress');
});

test('startTimer creates a session when none is running', () => {
    const app = loadApp({ dom: true, now: NOW });

    app.fns.startTimer('breast_left');

    const state = JSON.parse(app.localStorage.getItem(TIMER_KEY));
    assert.equal(state.active, true);
    assert.equal(state.segments.length, 1);
    assert.equal(state.segments[0].side, 'breast_left');
    assert.equal(state.segments[0].endTime, null);
});

// --- #11: ending a sub-second timer records nothing, and says so ---

test('endTimer discards a sub-second session instead of faking a save', async () => {
    const posts = [];
    const fetch = async (url, opts) => {
        posts.push({ url, opts });
        return { ok: true, status: 201, json: async () => ({}) };
    };
    const app = loadApp({
        dom: true,
        now: NOW,
        fetch,
        localStorage: { [TIMER_KEY]: JSON.stringify(runningTimer(400)) }, // 0.4s
    });

    await app.fns.endTimer();

    assert.equal(posts.length, 0, 'nothing is posted');
    assert.equal(app.localStorage.getItem(TIMER_KEY), null, 'the timer is cleared');
    assert.equal(toastText(app), 'Timer discarded — nothing to log');
    assert.doesNotMatch(toastText(app), /Feeding logged/);
});

test('endTimer logs a real session and reports it', async () => {
    const posts = [];
    const fetch = async (url, opts) => {
        posts.push({ url, body: JSON.parse(opts.body) });
        return { ok: true, status: 201, json: async () => ({}) };
    };
    const app = loadApp({
        dom: true,
        now: NOW,
        fetch,
        localStorage: { [TIMER_KEY]: JSON.stringify(runningTimer(90 * 1000)) }, // 90s
    });
    // No profiles -> reloadAfterLogChange() falls to loadDashboard; stub it so
    // the assertion isolates endTimer from the dashboard render + its fetch.
    app.state.childProfiles = [];
    app.override.loadDashboard(() => {});

    await app.fns.endTimer();

    assert.equal(posts.length, 1, 'one feeding is posted');
    assert.equal(posts[0].url, '/api/feedings');
    assert.equal(posts[0].body.feeding_type, 'breast_left');
    assert.equal(posts[0].body.duration_minutes, 2, '90s rounds to 2 minutes');
    assert.equal(posts[0].body.child_id, 1, 'the timer keeps the child it started under');
    assert.equal(app.localStorage.getItem(TIMER_KEY), null, 'the timer is cleared');
    assert.match(toastText(app), /^Feeding logged/);
});

// --- switch/pause round out the state machine so a regression there is caught ---

test('switchBreast opens a new segment on the other side', () => {
    const app = loadApp({ dom: true, now: NOW, localStorage: { [TIMER_KEY]: JSON.stringify(runningTimer(60000)) } });

    app.fns.switchBreast();

    const state = JSON.parse(app.localStorage.getItem(TIMER_KEY));
    assert.equal(state.segments.length, 2);
    assert.equal(state.segments[0].side, 'breast_left');
    assert.ok(state.segments[0].endTime, 'the first segment is closed');
    assert.equal(state.segments[1].side, 'breast_right');
    assert.equal(state.segments[1].endTime, null);
});

test('pauseTimer closes the open segment and marks paused', () => {
    const app = loadApp({ dom: true, now: NOW, localStorage: { [TIMER_KEY]: JSON.stringify(runningTimer(60000)) } });

    app.fns.pauseTimer();

    const state = JSON.parse(app.localStorage.getItem(TIMER_KEY));
    assert.equal(state.paused, true);
    assert.ok(state.segments[state.segments.length - 1].endTime, 'the running segment is closed');
});
