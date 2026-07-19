import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './harness.mjs';

// childQuery() builds the ?child_id / &unassigned suffix appended to every
// scoped read. Several bugs this project fixed (#5 last-session banner, #14
// dosage autofill) were unscoped fetches that leaked a sibling's data; these
// lock the scoping primitive those fixes rely on.

function withState({ profiles = [], selected = null, unassigned = 0 } = {}) {
    const app = loadApp();
    app.state.childProfiles = profiles;
    app.state.unassignedCount = unassigned;
    app.state.selectedChild = selected;
    return app;
}

test('no profiles: query is empty (whole-install view)', () => {
    const app = withState({ profiles: [], selected: null });
    assert.equal(app.fns.childQuery(), '');
});

test('a numeric selection scopes to that child', () => {
    const app = withState({ profiles: [{ id: 7 }], selected: 7 });
    assert.equal(app.fns.childQuery(), '&child_id=7');
    assert.equal(app.fns.currentChildId(), 7);
});

test('the unassigned view scopes to unassigned, not a child id', () => {
    const unassigned = loadApp().constants.UNASSIGNED_VIEW;
    const app = withState({ profiles: [{ id: 1 }], selected: unassigned });
    assert.equal(app.fns.childQuery(), '&unassigned=true');
    // New logs made from the unassigned view stay unassigned.
    assert.equal(app.fns.currentChildId(), null);
});

test('currentChildId is null unless a concrete child is selected', () => {
    const unassigned = loadApp().constants.UNASSIGNED_VIEW;
    assert.equal(withState({ selected: null }).fns.currentChildId(), null);
    assert.equal(withState({ selected: unassigned }).fns.currentChildId(), null);
    assert.equal(withState({ profiles: [{ id: 3 }], selected: 3 }).fns.currentChildId(), 3);
});

// resolveSelectedChild picks what the switcher lands on given stored state.
// The zero-profile install must always resolve to null -- the regression the
// child-profile feature had to preserve.
test('resolveSelectedChild returns null when there are no profiles', () => {
    const app = withState({ profiles: [] });
    assert.equal(app.fns.resolveSelectedChild(), null);
});

test('resolveSelectedChild defaults to the first profile', () => {
    const app = loadApp({ localStorage: {} });
    app.state.childProfiles = [{ id: 5 }, { id: 9 }];
    app.state.unassignedCount = 0;
    assert.equal(app.fns.resolveSelectedChild(), 5);
});

test('resolveSelectedChild honours a valid stored selection', () => {
    const app = loadApp({ localStorage: { 'puffin-selected-child': '9' } });
    app.state.childProfiles = [{ id: 5 }, { id: 9 }];
    assert.equal(app.fns.resolveSelectedChild(), 9);
});

test('resolveSelectedChild drops a stored id that no longer exists', () => {
    const app = loadApp({ localStorage: { 'puffin-selected-child': '999' } });
    app.state.childProfiles = [{ id: 5 }, { id: 9 }];
    assert.equal(app.fns.resolveSelectedChild(), 5, 'falls back to the first profile');
});

test('the unassigned view survives only while something is unassigned', () => {
    const stored = { 'puffin-selected-child': 'unassigned' };
    const withLogs = loadApp({ localStorage: stored });
    withLogs.state.childProfiles = [{ id: 5 }];
    withLogs.state.unassignedCount = 2;
    assert.equal(withLogs.fns.resolveSelectedChild(), 'unassigned');

    const empty = loadApp({ localStorage: stored });
    empty.state.childProfiles = [{ id: 5 }];
    empty.state.unassignedCount = 0;
    assert.equal(empty.fns.resolveSelectedChild(), 5, 'empty unassigned view falls back');
});
