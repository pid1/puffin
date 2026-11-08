FROM python:3.15.2-slim@sha256:c4158543ecb725b99e57d129dfd43d761d4c43e4577b5e23326aabb223cf7f4e AS builder

COPY --from=ghcr.io/astral-sh/uv:0.13.5@sha256:32a7bb39b496babbd997b0a39a4d66c126bdaf5661b302bf6f06abda8deca6ff /uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen --no-install-project

COPY src/ src/

RUN uv sync --no-dev --frozen

FROM python:3.15.2-slim@sha256:c4158543ecb725b99e57d129dfd43d761d4c43e4577b5e23326aabb223cf7f4e

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
