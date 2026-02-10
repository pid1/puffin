from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.base import BaseHTTPMiddleware

from puffin.database import init_db
from puffin.routers import dashboard, diapers, feedings, health

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
    init_db()
    yield


app = FastAPI(
    title="Puffin",
    description="Baby care activity tracker",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(NoCacheAPIMiddleware)

# Mount static files
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

# Templates
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# Include routers
app.include_router(diapers.router)
app.include_router(feedings.router)
app.include_router(health.router)
app.include_router(dashboard.router)


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})
