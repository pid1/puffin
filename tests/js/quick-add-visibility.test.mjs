import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './harness.mjs';

// Per-child quick add visibility is stored per device in localStorage, keyed
// by child id. getEnabledQuickAddTypes is the read primitive the dashboard and
// the settings checkboxes both trust; its whole contract is "when in doubt,
// show everything", so a missing/corrupt/empty value can never blank the
// dashboard. These lock that contract and the round-trip through setter/clear.

const KEY = (id) => `puffin-quick-add-${id}`;

function app(store = {}) {
    return loadApp({ localStorage: store });
}

test('all keys when nothing is stored for the child', () => {
    const a = app();
    assert.deepEqual(a.fns.getEnabledQuickAddTypes(1), a.constants.QUICK_ADD_KEYS);
});

test('a non-number child (unassigned / whole-install view) always gets all keys', () => {
    const a = app({ [KEY('null')]: '["health"]' }); // must not be consulted
    assert.deepEqual(a.fns.getEnabledQuickAddTypes(null), a.constants.QUICK_ADD_KEYS);
});

test('a stored subset is honoured, in registry order', () => {
    // Stored out of order on purpose; read back canonicalised.
    const a = app({ [KEY(3)]: '["health","diaper"]' });
    assert.deepEqual(a.fns.getEnabledQuickAddTypes(3), ['diaper', 'health']);
});

test('a single stored type is a valid state, not treated as empty', () => {
    const a = app({ [KEY(3)]: '["health"]' });
    assert.deepEqual(a.fns.getEnabledQuickAddTypes(3), ['health']);
});

test('unknown keys are dropped', () => {
    const a = app({ [KEY(3)]: '["feeding","sleep","bogus"]' });
    assert.deepEqual(a.fns.getEnabledQuickAddTypes(3), ['feeding']);
});

test('an all-unknown set falls back to all keys rather than blanking', () => {
    const a = app({ [KEY(3)]: '["sleep","bogus"]' });
    assert.deepEqual(a.fns.getEnabledQuickAddTypes(3), a.constants.QUICK_ADD_KEYS);
});

test('an empty array falls back to all keys', () => {
    const a = app({ [KEY(3)]: '[]' });
    assert.deepEqual(a.fns.getEnabledQuickAddTypes(3), a.constants.QUICK_ADD_KEYS);
});

test('a non-array value falls back to all keys', () => {
    const a = app({ [KEY(3)]: '"health"' });
    assert.deepEqual(a.fns.getEnabledQuickAddTypes(3), a.constants.QUICK_ADD_KEYS);
});

test('malformed JSON falls back to all keys and is logged, not thrown', () => {
    const a = app({ [KEY(3)]: '{oops' });
    assert.deepEqual(a.fns.getEnabledQuickAddTypes(3), a.constants.QUICK_ADD_KEYS);
    assert.equal(a.consoleErrors.length, 1);
    assert.match(a.consoleErrors[0], /quick-add/i);
});

test('set then get round-trips, and canonicalises order', () => {
    const a = app();
    a.fns.setEnabledQuickAddTypes(7, ['health', 'diaper']);
    assert.equal(a.localStorage.getItem(KEY(7)), '["diaper","health"]');
    assert.deepEqual(a.fns.getEnabledQuickAddTypes(7), ['diaper', 'health']);
});

test('set refuses an empty (or all-unknown) set, leaving storage untouched', () => {
    const a = app();
    a.fns.setEnabledQuickAddTypes(7, []);
    assert.equal(a.localStorage.getItem(KEY(7)), null);
    a.fns.setEnabledQuickAddTypes(7, ['nope']);
    assert.equal(a.localStorage.getItem(KEY(7)), null);
    // Which still reads as all-on, never empty.
    assert.deepEqual(a.fns.getEnabledQuickAddTypes(7), a.constants.QUICK_ADD_KEYS);
});

test('clear removes a child key without touching siblings', () => {
    const a = app({ [KEY(1)]: '["health"]', [KEY(2)]: '["feeding"]' });
    a.fns.clearQuickAddTypes(1);
    assert.equal(a.localStorage.getItem(KEY(1)), null);
    assert.equal(a.localStorage.getItem(KEY(2)), '["feeding"]');
});
