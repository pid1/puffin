import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './harness.mjs';

const NOW = Date.UTC(2026, 6, 19, 12, 0, 0); // 2026-07-19T12:00Z
const dayMs = 86400000;

// --- #3: the auto-refresh must follow the day across midnight ---

function rolloverApp() {
    const app = loadApp({ dom: true, now: NOW });
    // Isolate the date logic from the dashboard fetch + render.
    app.override.loadDashboard(() => {});
    return app;
}

test('refreshDashboard advances a page left open past midnight', () => {
    const app = rolloverApp();
    const yesterday = new Date(NOW - dayMs);
    // The page loaded yesterday, sitting on "today" as it was then.
    app.state.lastKnownToday = yesterday;
    app.state.currentDate = new Date(yesterday);

    app.fns.refreshDashboard();

    // currentDate now tracks the real today, and the calendar UI agrees.
    assert.equal(app.state.currentDate.getUTCDate(), new Date(NOW).getUTCDate());
    assert.equal(app.document.getElementById('cal-date-label').textContent, 'Today');
    assert.equal(app.document.getElementById('cal-next').disabled, true);
    assert.equal(app.document.getElementById('cal-today-pill').classList.contains('hidden'), true);
});

test('refreshDashboard leaves a deliberately-viewed past day alone', () => {
    const app = rolloverApp();
    const yesterday = new Date(NOW - dayMs);
    app.state.lastKnownToday = yesterday;
    // The user navigated back to four days ago; a rollover must not yank them forward.
    const viewed = new Date(NOW - 4 * dayMs);
    app.state.currentDate = new Date(viewed);

    app.fns.refreshDashboard();

    assert.equal(app.state.currentDate.getUTCDate(), viewed.getUTCDate(), 'stays on the viewed day');
});

test('refreshDashboard on the same day leaves the date put but still refreshes', () => {
    const app = loadApp({ dom: true, now: NOW });
    let refreshed = 0;
    app.override.loadDashboard(() => {
        refreshed += 1;
    });
    const today = new Date(NOW);
    app.state.lastKnownToday = today;
    app.state.currentDate = new Date(today);

    app.fns.refreshDashboard();

    // No rollover, so the calendar UI is intentionally not rewritten; the date
    // is unchanged and the periodic dashboard refresh still runs.
    assert.equal(app.state.currentDate.getUTCDate(), today.getUTCDate());
    assert.equal(refreshed, 1, 'the dashboard is still reloaded');
});

// --- #4: a failed /api/children load must not wipe state ---

test('loadChildren keeps last-known state when the fetch fails', async () => {
    const app = loadApp({
        dom: true,
        now: NOW,
        fetch: async () => {
            throw new Error('network down');
        },
        localStorage: { 'puffin-selected-child': '7' },
    });
    const profiles = [{ id: 7, name: 'Maya' }, { id: 9, name: 'Theo' }];
    app.state.childProfiles = profiles;
    app.state.unassignedCount = 3;
    app.state.selectedChild = 7;

    await app.fns.loadChildren();

    // Nothing is wiped, and the stored selection is not cleared -- the failure
    // must not masquerade as a zero-profile install.
    assert.deepEqual(app.state.childProfiles, profiles);
    assert.equal(app.state.selectedChild, 7);
    assert.equal(app.localStorage.getItem('puffin-selected-child'), '7');
    assert.equal(app.document.getElementById('toast').textContent,
        'Could not load profiles — showing last known state');
    assert.ok(app.consoleErrors.some((e) => e.includes('Failed to load children')));
});

test('loadChildren adopts fresh data on success', async () => {
    const fetched = {
        '/api/children': [{ id: 5, name: 'Ada' }],
        '/api/children/unassigned': { count: 0 },
    };
    const app = loadApp({
        dom: true,
        now: NOW,
        fetch: async (url) => ({ ok: true, status: 200, json: async () => fetched[url] }),
    });
    app.state.childProfiles = [];

    await app.fns.loadChildren();

    assert.deepEqual(app.state.childProfiles, [{ id: 5, name: 'Ada' }]);
    assert.equal(app.state.selectedChild, 5, 'defaults to the first profile');
});
