# AGENTS.md

## Development Environment

This project uses [devenv](https://devenv.sh) for reproducible development environments.

### Quick Setup

```bash
devenv shell
setup        # runs: install-deps
dev          # start FastAPI dev server on port 8000
```

### Commands

| Command        | Description                                         |
| -------------- | --------------------------------------------------- |
| `setup`        | Initialize repo (runs: install-deps)                |
| `dev`          | Start FastAPI dev server on port 8000 (interactive) |
| `dev-start`    | Start dev server in background (non-interactive)    |
| `dev-stop`     | Stop background dev server                          |
| `dev-status`   | Check status of background processes                |
| `dev-logs`     | View last 50 lines of dev logs                      |
| `lint`         | Run ruff linter                                     |
| `lint-fix`     | Run ruff linter with auto-fix                       |
| `format`       | Run ruff formatter                                  |
| `test`         | Run all tests (Python + JS)                         |
| `test-py`      | Run pytest only                                     |
| `test-js`      | Run JS tests only (Node's built-in `node:test`)     |
| `install-deps` | Install dependencies with uv                        |
| `seed`         | Generate 14 days of demo data                       |
| `backup`       | Snapshot the database into `<db-dir>/backups`       |

### For AI Agents

**IMPORTANT**: When working in this repository:

1. **Always use devenv scripts** — Run `lint` not `ruff check .`, run `test` not `uv run pytest`
2. **Use non-interactive commands** — For automation, use:
   - `dev-start` instead of `dev` (runs in background, returns immediately)
   - `dev-stop` to stop background processes
   - `dev-status` to check if processes are running
   - `dev-logs` to view recent output (non-blocking)
3. **Check process status** — Before starting servers, run `dev-status`
4. **View logs for errors** — After starting, check `dev-logs` for issues

## Project Structure

- `src/puffin/` — FastAPI application (models, schemas, crud, routers)
- `templates/` — Jinja2 HTML templates (`index.html` dashboard, `settings.html`)
- `static/` — CSS and JavaScript assets; `common.js` is the shared layer both
  pages load, with `app.js` (dashboard) and `settings.js` layered on top
- `tests/` — pytest test suite
- `tests/js/` — JS tests (`node:test`); `harness.mjs` loads `static/js/common.js`
  and `static/js/app.js` unmodified and exposes their DOM-free functions

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy + SQLite
- **Frontend**: Vanilla HTML/CSS/JS (no build step)
- **Package Manager**: uv
- **Linter/Formatter**: ruff
- **Tests**: pytest with httpx TestClient (backend); Node's built-in
  `node:test` runner (frontend, no npm dependencies)

## Sadr

### Build and test
- Run the checks inside devenv: `devenv shell -- test-py` (pytest, 197 tests on 2026-10-25), then `devenv shell -- test-js` (node:test, 64 tests), then `devenv shell -- lint`.
- Call `test-py` and `test-js` by name inside `bash -c`, because `test` there is the shell builtin, not the devenv script.
- `lint` runs the ruff from nixpkgs (0.17.2 on 2026-10-25), not the ruff in `uv.lock` (0.17.1), so the two can disagree.
- The app check is `dev-start`, then `GET /` and `GET /settings` on port 8000 return 200, then `dev-stop`.
- CI runs no tests and no lint. `container.yml` builds the image, and `semgrep.yml` runs the required `semgrep/ci` check.

### Toolchain
- `.gitignore` excludes `devenv.lock`, so devenv's Python, Node, uv and ruff float with nixpkgs-unstable.
- The container image installs from `uv.lock` with `uv sync --frozen`, so the lockfile is what ships.
