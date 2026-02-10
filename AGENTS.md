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

| Command | Description |
|---------|-------------|
| `setup` | Initialize repo (runs: install-deps) |
| `dev` | Start FastAPI dev server on port 8000 (interactive) |
| `dev-start` | Start dev server in background (non-interactive) |
| `dev-stop` | Stop background dev server |
| `dev-status` | Check status of background processes |
| `dev-logs` | View last 50 lines of dev logs |
| `lint` | Run ruff linter |
| `lint-fix` | Run ruff linter with auto-fix |
| `format` | Run ruff formatter |
| `test` | Run pytest |
| `install-deps` | Install dependencies with uv |
| `seed` | Generate 14 days of demo data |

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
- `templates/` — Jinja2 HTML templates
- `static/` — CSS and JavaScript assets
- `tests/` — pytest test suite

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy + SQLite
- **Frontend**: Vanilla HTML/CSS/JS (no build step)
- **Package Manager**: uv
- **Linter/Formatter**: ruff
- **Tests**: pytest with httpx TestClient
