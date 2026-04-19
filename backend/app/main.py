"""CashFlow Pilot — FastAPI application entry point."""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.core.config import get_settings
from app.core.database import connect_to_mongo, close_mongo_connection, ensure_indexes
from app.routers import auth, imports, data, actions, settings as settings_router, analytics, reports
from app.services.report_scheduler import start_scheduler, stop_scheduler


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    connect_to_mongo()
    await ensure_indexes()
    start_scheduler()
    s = get_settings()
    logger.info("Backend started. AI=%s, Email=%s, Scheduler=on", s.ai_enabled, s.email_enabled)
    yield
    # Shutdown
    stop_scheduler()
    close_mongo_connection()
    logger.info("Backend stopped.")


app = FastAPI(
    title="CashFlow Pilot API",
    description="Multi-tenant recouvrement dashboard API",
    version="1.1.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,  # Required for httpOnly cookies
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers — all mounted under /api
app.include_router(auth.router, prefix="/api")
app.include_router(imports.router, prefix="/api")
app.include_router(data.router, prefix="/api")
app.include_router(actions.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(reports.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "ai_enabled": settings.ai_enabled,
        "email_enabled": settings.email_enabled,
    }
