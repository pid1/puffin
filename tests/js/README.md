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
Map-backed `localStorage`, and a `console` that records `error` calls.

## What is and isn't covered

Covered: the DOM-free logic — time formatting (`timeAgo`), child scoping
(`childQuery`, `currentChildId`, `resolveSelectedChild`), and reading the timer
state (`getTimerState`).

Not covered here: functions that drive the DOM (`showTimerUI`, the `render*`
family, the bootstrap) or perform fetches (`startTimer` end-to-end,
`loadChildren`, `refreshDashboard`). Exercising those needs a DOM, which this
harness deliberately does not stand up. They remain verified by hand against
the running app; wiring a DOM fixture so they can be tested here is the natural
next step.
