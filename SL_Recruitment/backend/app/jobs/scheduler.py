from __future__ import annotations

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.jobs.tasks import (
    run_caf_reminders,
    run_interview_feedback_reminders,
    run_interview_status_reminders,
    run_offer_followups,
    run_sprint_reminders,
    run_stale_stage_sweep,
)


def start_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(run_caf_reminders, IntervalTrigger(minutes=30), id="caf_reminders", replace_existing=True)
    scheduler.add_job(
        run_interview_feedback_reminders,
        IntervalTrigger(minutes=30),
        id="interview_feedback_reminders",
        replace_existing=True,
    )
    scheduler.add_job(
        run_interview_status_reminders,
        IntervalTrigger(minutes=30),
        id="interview_status_reminders",
        replace_existing=True,
    )
    scheduler.add_job(run_sprint_reminders, IntervalTrigger(minutes=60), id="sprint_reminders", replace_existing=True)
    scheduler.add_job(run_offer_followups, IntervalTrigger(hours=6), id="offer_followups", replace_existing=True)
    scheduler.add_job(run_stale_stage_sweep, IntervalTrigger(hours=6), id="stale_stage_sweep", replace_existing=True)
    scheduler.start()
    return scheduler
