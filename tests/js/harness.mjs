// Test harness for the dashboard's scripts: static/js/common.js + app.js.
//
// Both ship as plain browser <script>s: global `function` declarations and a
// single DOMContentLoaded bootstrap at the very bottom of app.js, no exports.
// Rather than refactor code that has no tests yet, this harness evaluates the
// sources in a controlled scope and appends an epilogue -- running in that same
// scope -- that hands back the functions and getter/setters for the mutable
// `let` state. The shipped files are used byte-for-byte and never modified.
//
// DOM-free functions load with no options. DOM-driven ones (the timer state
// machine, the calendar rollover, loadChildren) need loadApp({ dom: true }),
// which installs a minimal hand-rolled document (fake-dom.mjs). Timers are
// always stubbed so nothing schedules real work and leaks past the test.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDocument } from './fake-dom.mjs';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATIC_JS = join(HERE, '..', '..', 'static', 'js');

// Concatenated in the same order the dashboard's <script> tags load them:
// common.js declares the shared layer (API client, toasts, theme, modals, the
// child-profile subsystem), app.js the dashboard on top of it. Evaluating them
// together reproduces the single shared scope the browser gives these classic
// scripts, so a function in one can still see a declaration in the other.
const SOURCE_FILES = ['common.js', 'app.js'];

// The surface we lift out of app.js. Each name must be a real declaration in
// the file, or the epilogue throws ReferenceError at load (a useful tripwire
// if a function is renamed).
const EXPOSED_FUNCTIONS = [
    // DOM-free
    'timeAgo',
    'formatShortDate',
    'formatTime',
    'childQuery',
    'currentChildId',
    'resolveSelectedChild',
    'hasProfiles',
    'getTimerState',
    'storeSelectedChild',
    'readStoredChild',
    'validateBottleAmountUnit',
    'getEnabledQuickAddTypes',
    'setEnabledQuickAddTypes',
    'clearQuickAddTypes',
    // DOM-driven (only callable when loadApp({ dom: true }))
    'startTimer',
    'endTimer',
    'switchBreast',
    'pauseTimer',
    'resumeTimer',
    'showTimerUI',
    'refreshDashboard',
    'updateCalendarUI',
    'loadChildren',
];

// Mutable module-level `let`s tests need to drive. Exposed as getter/setters so
// a test can set state and read back what the code did to it.
const EXPOSED_STATE = [
    'selectedChild',
    'childProfiles',
    'unassignedCount',
    'currentDate',
    'lastKnownToday',
];

const EXPOSED_CONSTANTS = ['UNASSIGNED_VIEW', 'SELECTED_CHILD_KEY', 'QUICK_ADD_KEYS'];

// Reassignable function bindings a test can stub to isolate the function under
// test from its heavier collaborators (fetch + render cascades).
const OVERRIDABLE = ['loadDashboard', 'refreshChildUI', 'loadDayActivities'];

function makeLocalStorage(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
        get length() {
            return store.size;
        },
        _dump: () => Object.fromEntries(store),
    };
}

// A Date whose "now" is pinned, so relative-time formatting is deterministic.
// `new Date(iso)` and every other Date behaviour pass straight through.
function makeFixedDate(fixedNowMs) {
    const RealDate = Date;
    return new Proxy(RealDate, {
        construct(target, args) {
            return args.length ? new target(...args) : new target(fixedNowMs);
        },
        get(target, prop) {
            if (prop === 'now') return () => fixedNowMs;
            return target[prop];
        },
    });
}

// No-op timer factory: records scheduled callbacks but never runs them, so a
// setInterval in showTimerUI can't keep the node:test process alive.
function makeTimers() {
    let nextId = 1;
    const scheduled = [];
    return {
        scheduled,
        setTimeout: (fn, ms) => {
            scheduled.push({ kind: 'timeout', fn, ms, id: nextId });
            return nextId++;
        },
        setInterval: (fn, ms) => {
            scheduled.push({ kind: 'interval', fn, ms, id: nextId });
            return nextId++;
        },
        clearTimeout: () => {},
        clearInterval: () => {},
    };
}

/**
 * Load app.js into a fresh, isolated scope.
 *
 * @param {object} opts
 * @param {object} [opts.localStorage] initial key/value seed for localStorage
 * @param {number} [opts.now] fixed epoch ms for Date.now()/new Date()
 * @param {function} [opts.fetch] fetch stub
 * @param {boolean} [opts.dom] install the hand-rolled fake document
 * @returns {{fns, state, constants, api, localStorage, document, timers,
 *            consoleErrors, override}}
 */
export function loadApp(opts = {}) {
    const source = SOURCE_FILES
        .map((name) => readFileSync(join(STATIC_JS, name), 'utf8'))
        .join('\n');

    const localStorage = makeLocalStorage(opts.localStorage || {});
    const consoleErrors = [];
    const DateImpl = opts.now != null ? makeFixedDate(opts.now) : Date;
    const timers = makeTimers();

    // With dom:true, a real (if minimal) document. Otherwise a stub whose only
    // job is to absorb the bootstrap's addEventListener.
    const documentImpl = opts.dom
        ? createDocument()
        : { addEventListener: () => {}, getElementById: () => null, querySelectorAll: () => [] };
    const windowStub = { addEventListener: () => {} };
    const consoleStub = {
        ...console,
        error: (...a) => consoleErrors.push(a.map(String).join(' ')),
    };
    const fetchStub = opts.fetch || (() => Promise.reject(new Error('fetch not stubbed')));

    const epilogue = `
        ;(function () {
            const fns = {};
            ${EXPOSED_FUNCTIONS.map((n) => `fns[${JSON.stringify(n)}] = ${n};`).join('\n')}
            __exports.fns = fns;
            __exports.api = api;
            __exports.state = {};
            ${EXPOSED_STATE.map(
                (n) => `Object.defineProperty(__exports.state, ${JSON.stringify(n)}, {
                    get: () => ${n}, set: (v) => { ${n} = v; }, enumerable: true });`
            ).join('\n')}
            __exports.constants = { ${EXPOSED_CONSTANTS.join(', ')} };
            // Setters for reassignable function bindings, so a test can stub a
            // heavy collaborator (loadDashboard, refreshChildUI, ...).
            __exports.override = {};
            ${OVERRIDABLE.map(
                (n) => `__exports.override[${JSON.stringify(n)}] = (f) => { ${n} = f; };`
            ).join('\n')}
        })();
    `;

    const params = [
        'window',
        'document',
        'localStorage',
        'fetch',
        'console',
        'Date',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        '__exports',
    ];
    const exports = {};
    // eslint-disable-next-line no-new-func
    const run = new Function(...params, source + epilogue);
    run(
        windowStub,
        documentImpl,
        localStorage,
        fetchStub,
        consoleStub,
        DateImpl,
        timers.setTimeout,
        timers.clearTimeout,
        timers.setInterval,
        timers.clearInterval,
        exports
    );

    return {
        fns: exports.fns,
        state: exports.state,
        constants: exports.constants,
        api: exports.api,
        override: exports.override,
        localStorage,
        document: documentImpl,
        timers,
        consoleErrors,
    };
}
