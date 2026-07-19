// Test harness for static/js/app.js.
//
// app.js ships as a plain browser <script>: global `function` declarations and
// a single DOMContentLoaded bootstrap at the very bottom, no exports. Rather
// than refactor 2200 lines that have no tests yet, this harness evaluates the
// source in a controlled scope and appends an epilogue -- running in that same
// scope -- that hands back the functions and getter/setters for the mutable
// `let` state. The shipped file is used byte-for-byte and never modified.
//
// Only DOM-free functions are exposed here (time formatting, child scoping,
// timer state read). Functions that drive the DOM (showTimerUI, render*, the
// bootstrap) are exercised in the app itself; wiring a full DOM is a separate,
// heavier step and deliberately out of this first harness.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_PATH = join(HERE, '..', '..', 'static', 'js', 'app.js');

// The surface we lift out of app.js. Each name must be a real declaration in
// the file, or the epilogue throws ReferenceError at load (a useful tripwire
// if a function is renamed).
const EXPOSED_FUNCTIONS = [
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
];

// Mutable module-level `let`s tests need to drive. Exposed as getter/setters so
// a test can set state and read back what the code did to it.
const EXPOSED_STATE = ['selectedChild', 'childProfiles', 'unassignedCount'];

const EXPOSED_CONSTANTS = ['UNASSIGNED_VIEW', 'SELECTED_CHILD_KEY'];

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

/**
 * Load app.js into a fresh, isolated scope.
 *
 * @param {object} opts
 * @param {object} [opts.localStorage] initial key/value seed for localStorage
 * @param {number} [opts.now] fixed epoch ms for Date.now()/new Date()
 * @param {function} [opts.fetch] fetch stub
 * @returns an object with { fns, state, constants, localStorage, consoleErrors }
 */
export function loadApp(opts = {}) {
    const source = readFileSync(APP_PATH, 'utf8');

    const localStorage = makeLocalStorage(opts.localStorage || {});
    const consoleErrors = [];
    const DateImpl = opts.now != null ? makeFixedDate(opts.now) : Date;

    // Minimal ambient stubs. The bootstrap only calls document.addEventListener;
    // getElementById is present but unused by the exposed functions.
    const documentStub = {
        addEventListener: () => {},
        getElementById: () => null,
        querySelectorAll: () => [],
    };
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
            __exports.state = {};
            ${EXPOSED_STATE.map(
                (n) => `Object.defineProperty(__exports.state, ${JSON.stringify(n)}, {
                    get: () => ${n}, set: (v) => { ${n} = v; }, enumerable: true });`
            ).join('\n')}
            __exports.constants = { ${EXPOSED_CONSTANTS.join(', ')} };
        })();
    `;

    const params = [
        'window',
        'document',
        'localStorage',
        'fetch',
        'console',
        'Date',
        '__exports',
    ];
    const exports = {};
    // eslint-disable-next-line no-new-func
    const run = new Function(...params, source + epilogue);
    run(windowStub, documentStub, localStorage, fetchStub, consoleStub, DateImpl, exports);

    return {
        fns: exports.fns,
        state: exports.state,
        constants: exports.constants,
        localStorage,
        consoleErrors,
    };
}
