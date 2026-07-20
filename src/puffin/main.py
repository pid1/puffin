import math
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.base import BaseHTTPMiddleware

from puffin.crud import warn_if_tz_unconfigured
from puffin.database import init_db
from puffin.routers import activities, children, dashboard, diapers, feedings, health

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class NoCacheAPIMiddleware(BaseHTTPMiddleware):
    """Prevent browser from caching API responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    warn_if_tz_unconfigured()
    init_db()
    yield


app = FastAPI(
    title="Puffin",
    description="Baby care activity tracker",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(NoCacheAPIMiddleware)


def _json_safe(value):
    """Replace non-finite floats with their string form, recursively.

    ``NaN`` and ``Infinity`` are not valid JSON, and Python's stdlib encoder
    raises on them rather than emitting the non-standard literals it accepts
    on input.
    """
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    return value


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Render validation errors that echo a non-finite float.

    Python's json parser accepts bare ``NaN``/``Infinity`` literals, so such a
    value reaches the schema and is correctly rejected -- but FastAPI's default
    handler echoes the offending input back in the error detail, where the
    encoder cannot serialize it. That turned a clean 422 into a 500 at the
    response layer. Scrub the echoed input so the rejection is what the client
    actually sees.
    """
    return JSONResponse(
        status_code=422,
        content={"detail": _json_safe(jsonable_encoder(exc.errors()))},
    )


# Mount static files
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

# Templates
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# Include routers
app.include_router(activities.router)
app.include_router(children.router)
app.include_router(diapers.router)
app.include_router(feedings.router)
app.include_router(health.router)
app.include_router(dashboard.router)


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/settings", response_class=HTMLResponse)
def settings(request: Request):
    return templates.TemplateResponse("settings.html", {"request": request})
