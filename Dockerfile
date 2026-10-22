FROM python:3.15-slim AS builder

# uv 0.13.1 (released 2026-10-14) pinned by digest. It reads the relative
# exclude-newer cooldown in pyproject.toml; --locked fails the build if
# uv.lock no longer matches pyproject.toml instead of installing a stale lock.
COPY --from=ghcr.io/astral-sh/uv:0.13.1@sha256:4a1f3666816dafadd20ceb71eac9a7d56d7ef30279f7d64048519ab901ada336 /uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --locked --no-install-project

COPY src/ src/

RUN uv sync --no-dev --locked

FROM python:3.15-slim

WORKDIR /app
COPY --from=builder /app/.venv .venv
COPY src/ src/
COPY templates/ templates/
COPY static/ static/

ENV PATH="/app/.venv/bin:$PATH" \
    PUFFIN_DB_PATH="/data/puffin.db"

EXPOSE 8000

# Do not run as root. The mount points are created and chowned *before*
# the VOLUME lines, because changes made to a declared volume path later
# in the build are discarded.
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin app \
    && mkdir -p /data \
    && chown -R 10001 /app /data

VOLUME /data

USER 10001

CMD ["uvicorn", "puffin.main:app", "--host", "0.0.0.0", "--port", "8000"]
