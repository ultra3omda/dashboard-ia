"""Scheduler that triggers report runs based on each config's schedule.

Implementation notes:
- We use a single tick (every minute) that looks up configs whose scheduled
  time is "now" (within the current minute) and hasn't been run today at
  this scheduled time already.
- We purposely avoid APScheduler's per-job persistence so that config
  changes made through the UI take effect immediately on the next tick,
  without complex sync logic.
- Timezone: UTC for now. The `hour`/`minute` fields on ReportSchedule are
  interpreted as UTC. A future enhancement would be per-org timezone.
"""
from __future__ import annotations
import logging
from datetime import datetime, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.database import get_db
from app.models.report import ReportConfig
from app.services.report_runner import run_report

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


def _is_due(config: ReportConfig, now: datetime) -> bool:
    """Return True if this config should run at the current minute."""
    s = config.schedule

    # Time match — hour and minute
    if now.hour != s.hour or now.minute != s.minute:
        return False

    # Frequency match
    if s.frequency == "daily":
        pass  # always runs
    elif s.frequency == "weekly":
        # 0=Monday … 6=Sunday
        if s.day_of_week is None or s.day_of_week != now.weekday():
            return False
    elif s.frequency == "monthly":
        if s.day_of_month is None or s.day_of_month != now.day:
            return False
    else:
        return False

    # Last-run deduplication: skip if we already ran today at or after this scheduled time
    if config.last_run_at:
        today_scheduled = now.replace(second=0, microsecond=0)
        last = config.last_run_at
        # If last run is less than 23 hours ago AND within the same scheduled slot, skip
        if last >= today_scheduled - timedelta(minutes=1):
            return False
    return True


async def _tick() -> None:
    """Called every minute: find due configs and fire report_runner."""
    db = get_db()
    now = datetime.utcnow().replace(second=0, microsecond=0)
    cursor = db.report_configs.find({"enabled": True})
    fired = 0
    async for doc in cursor:
        doc.pop("_id", None)
        try:
            config = ReportConfig(**doc)
        except Exception as e:
            logger.error("Invalid report config %s: %s", doc.get("id"), e)
            continue
        if _is_due(config, now):
            logger.info("Report due: %s (org=%s)", config.name, config.org_id)
            try:
                await run_report(config, triggered_by="scheduler")
                fired += 1
            except Exception:
                logger.exception("run_report failed for config %s", config.id)
    if fired:
        logger.info("Scheduler tick fired %d report(s)", fired)


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(_tick, "cron", minute="*", id="report_tick", replace_existing=True)
    _scheduler.start()
    logger.info("Report scheduler started (ticks every minute, UTC)")


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Report scheduler stopped")
