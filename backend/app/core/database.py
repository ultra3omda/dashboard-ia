"""MongoDB async client and database singleton."""
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.core.config import get_settings

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


def connect_to_mongo() -> None:
    """Initialise the MongoDB client. Call once at startup."""
    global _client, _db
    settings = get_settings()
    _client = AsyncIOMotorClient(settings.mongo_url, uuidRepresentation="standard")
    _db = _client[settings.db_name]


def close_mongo_connection() -> None:
    """Clean up the MongoDB client. Call at shutdown."""
    global _client, _db
    if _client is not None:
        _client.close()
    _client = None
    _db = None


def get_db() -> AsyncIOMotorDatabase:
    """Get the current database handle. Requires connect_to_mongo() first."""
    if _db is None:
        raise RuntimeError("Database not initialised. Call connect_to_mongo() first.")
    return _db


async def ensure_indexes() -> None:
    """Create all required indexes. Idempotent."""
    db = get_db()

    # orgs — unique slug
    await db.orgs.create_index("slug", unique=True)

    # users — unique email globally
    await db.users.create_index("email", unique=True)
    await db.users.create_index("org_id")

    # clients — dedup key (org_id, nom_normalized)
    await db.clients.create_index([("org_id", 1), ("nom_normalized", 1)], unique=True)

    # factures — dedup key (org_id, numFacture)
    await db.factures.create_index([("org_id", 1), ("numFacture", 1)], unique=True)
    await db.factures.create_index([("org_id", 1), ("nomClient", 1)])
    await db.factures.create_index([("org_id", 1), ("dateFacture", -1)])

    # actions — by org and client
    await db.actions.create_index([("org_id", 1), ("clientNom", 1)])
    await db.actions.create_index([("org_id", 1), ("datePrevue", 1)])

    # settings — one doc per org
    await db.settings.create_index("org_id", unique=True)

    # import_logs — timeline
    await db.import_logs.create_index([("org_id", 1), ("created_at", -1)])

    # ai_suggestions_cache — TTL index will be managed at query time
    await db.ai_cache.create_index([("org_id", 1), ("cache_key", 1)], unique=True)
    await db.ai_cache.create_index("expires_at", expireAfterSeconds=0)

    # report_configs (prepared for Phase 2)
    await db.report_configs.create_index([("org_id", 1), ("enabled", 1)])
