# Frontend tests

These cover `static/js/app.js` using Node's built-in test runner
(`node:test` + `node:assert`). There are **no npm dependencies** — the only
requirement is the `node` binary, which devenv provides.

Run them with `test-js` (or `test` for both suites).

## How it works

`app.js` ships as a plain browser `<script>`: top-level `function`
declarations and a single `DOMContentLoaded` bootstrap at the bottom, with no
module exports. `harness.mjs` evaluates the file's source in an isolated scope
and appends an epilogue — running in that same scope — that hands back the
functions plus getter/setters for the mutable `let` state (`selectedChild`,
`childProfiles`, `unassignedCount`).

The shipped file is used **byte-for-byte and never modified**, so a test that
passes reflects the code that actually runs in the browser. If a covered
function is renamed, the epilogue throws `ReferenceError` at load — a
deliberate tripwire.

The harness injects a fixed `Date` (deterministic relative-time formatting), a
Map-backed `localStorage`, a `console` that records `error` calls, and no-op
timers (so a `setInterval` in `showTimerUI` can't keep the process alive).

## Two tiers

**DOM-free** (`loadApp()`): time formatting (`timeAgo`), child scoping
(`childQuery`, `currentChildId`, `resolveSelectedChild`), and reading the timer
state (`getTimerState`).

**DOM-driven** (`loadApp({ dom: true })`): installs a minimal hand-rolled
`document` (`fake-dom.mjs`) so the timer state machine (`startTimer`,
`endTimer`, `switchBreast`, `pauseTimer`), the calendar rollover
(`refreshDashboard`, `updateCalendarUI`), and `loadChildren` can run. Fetches
are driven by an `opts.fetch` stub, and `loadApp().api` / `.override` let a test
capture requests or stub a heavy collaborator (e.g. `loadDashboard`) to isolate
the function under test.

`fake-dom.mjs` is deliberately minimal — `getElementById` returning stateful
elements with `classList` / `textContent` / `innerHTML` / `value` / `disabled`
/ `dataset`, and little else. If a newly covered function needs more, extend it
there rather than reaching for jsdom.

## Still not covered

The `render*` family and the full `DOMContentLoaded` bootstrap (event wiring)
aren't exercised — they touch far more of the DOM and carry less logic. They
remain verified by hand against the running app.
