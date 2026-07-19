import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './harness.mjs';

// Fixed reference point so every relative-time assertion is deterministic.
const NOW = Date.UTC(2026, 6, 19, 12, 0, 0); // 2026-07-19T12:00:00Z
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

function timeAgo(input) {
    return loadApp({ now: NOW }).fns.timeAgo(input);
}

test('empty input renders nothing', () => {
    assert.equal(timeAgo(''), '');
    assert.equal(timeAgo(null), '');
});

test('minutes and hours read relatively', () => {
    assert.equal(timeAgo(iso(5 * 60000)), '5m ago');
    assert.equal(timeAgo(iso(59 * 60000)), '59m ago');
    assert.equal(timeAgo(iso(3 * 3600000)), '3h 0m ago');
    assert.equal(timeAgo(iso(3 * 3600000 + 25 * 60000)), '3h 25m ago');
});

test('just-now boundary', () => {
    assert.equal(timeAgo(iso(30 * 1000)), 'just now');
    assert.equal(timeAgo(iso(60 * 1000)), '1m ago');
});

// The bug this batch fixed (#18): past 24h the old code fell back to a bare
// clock time, so a three-day-old change read like "08:32" -- indistinguishable
// from earlier today. It must now carry a day count, then a date past a week.
test('past 24h uses a day count, not a bare clock time', () => {
    const twoDays = timeAgo(iso(2 * 86400000));
    assert.equal(twoDays, '2d ago');
    assert.doesNotMatch(twoDays, /^\d{1,2}:\d{2}/, 'must not be a bare HH:MM');
});

test('just over 24h is 1d ago, not an hour count', () => {
    assert.equal(timeAgo(iso(25 * 3600000)), '1d ago');
});

test('beyond a week switches to a short date', () => {
    // 10 days before 2026-07-19 is 2026-07-09.
    const out = timeAgo(iso(10 * 86400000));
    assert.match(out, /Jul/);
    assert.match(out, /\b9\b/);
    assert.doesNotMatch(out, /ago/);
});

test('six days is still a day count, seven flips to a date', () => {
    assert.equal(timeAgo(iso(6 * 86400000)), '6d ago');
    assert.doesNotMatch(timeAgo(iso(7 * 86400000)), /ago/);
});

// A future timestamp (a mistyped or scheduled entry) must also be legible as a
// date, not a bare clock time that reads as "today".
test('future timestamps show a date, not a bare clock time', () => {
    const future = new Date(NOW + 2 * 86400000).toISOString();
    const out = timeAgo(future);
    assert.match(out, /Jul/);
    assert.doesNotMatch(out, /ago/);
    assert.doesNotMatch(out, /^\d{1,2}:\d{2}\s*(AM|PM)?$/i, 'must not be time-only');
});
