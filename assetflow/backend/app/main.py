import time
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from app.api import auth, org, assets, allocations, bookings, maintenance, audits, misc
from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.scheduler import start_scheduler
    sched = start_scheduler()
    yield
    sched.shutdown(wait=False)


app = FastAPI(
    title="AssetFlow API",
    description="Enterprise Asset & Resource Management System",
    version="1.0.0",
    lifespan=lifespan,
)

# ---- Middleware stack: CORS -> rate limit -> request logging ----
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173", "http://localhost:3000", "http://localhost:8080", "http://127.0.0.1:5173", "http://127.0.0.1:3000", "http://127.0.0.1:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_BUCKETS: dict = defaultdict(list)
RATE_LIMIT, RATE_WINDOW = 120, 60  # 120 req / min / ip


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    _BUCKETS[ip] = [t for t in _BUCKETS[ip] if now - t < RATE_WINDOW]
    if len(_BUCKETS[ip]) >= RATE_LIMIT:
        return JSONResponse({"detail": "Rate limit exceeded"}, status_code=429)
    _BUCKETS[ip].append(now)
    return await call_next(request)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    logger.info(f"{request.method} {request.url.path} -> {response.status_code} "
                f"({(time.time() - start) * 1000:.0f}ms)")
    return response


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    logger.exception(f"Unhandled error on {request.url.path}: {exc}")
    return JSONResponse({"detail": "Internal server error"}, status_code=500)


# ---- Routers ----
app.include_router(auth.router)
app.include_router(org.router)
app.include_router(assets.router)
app.include_router(allocations.router)
app.include_router(allocations.transfer_router)
app.include_router(bookings.router)
app.include_router(maintenance.router)
app.include_router(audits.router)
app.include_router(misc.router)


@app.get("/")
def health():
    return {"app": "AssetFlow", "status": "ok", "docs": "/docs"}
