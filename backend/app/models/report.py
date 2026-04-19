"""Report configurations and execution logs for scheduled email reports."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, EmailStr
import uuid


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.utcnow()


class ReportFilters(BaseModel):
    """Filters applied to the analytics before rendering the report."""
    activite: Optional[str] = None
    group_mode: str = "all"  # all | external | group
    only_overdue: bool = False


class ReportSchedule(BaseModel):
    """When to send the report."""
    frequency: str  # daily | weekly | monthly
    day_of_week: Optional[int] = None  # 0=Monday … 6=Sunday (for weekly)
    day_of_month: Optional[int] = None  # 1..28 (for monthly)
    hour: int = 8  # 0..23, local tz of the scheduler
    minute: int = 0


class ReportSections(BaseModel):
    """Which sections to include in the rendered HTML."""
    kpis: bool = True
    aging: bool = True
    top_clients: bool = True
    activities: bool = True
    clients_at_risk: bool = True
    ai_suggestions: bool = False  # opt-in, triggers Claude API call at send time


class ReportConfigCreate(BaseModel):
    name: str
    description: str = ""
    recipients: list[EmailStr]
    schedule: ReportSchedule
    filters: ReportFilters = Field(default_factory=ReportFilters)
    sections: ReportSections = Field(default_factory=ReportSections)
    template: str = "default"  # default | ceo | cfo | chef_dep | chef_projet
    enabled: bool = True


class ReportConfigUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    recipients: Optional[list[EmailStr]] = None
    schedule: Optional[ReportSchedule] = None
    filters: Optional[ReportFilters] = None
    sections: Optional[ReportSections] = None
    template: Optional[str] = None
    enabled: Optional[bool] = None


class ReportConfig(BaseModel):
    id: str = Field(default_factory=_uuid)
    org_id: str
    name: str
    description: str = ""
    recipients: list[str]
    schedule: ReportSchedule
    filters: ReportFilters = Field(default_factory=ReportFilters)
    sections: ReportSections = Field(default_factory=ReportSections)
    template: str = "default"
    enabled: bool = True
    created_by: str = ""
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
    last_run_at: Optional[datetime] = None
    last_run_status: Optional[str] = None  # success | error


class ReportRun(BaseModel):
    """Execution log for a single report send."""
    id: str = Field(default_factory=_uuid)
    org_id: str
    config_id: str
    config_name: str
    triggered_by: str  # scheduler | manual:<user_id>
    recipients: list[str]
    status: str  # success | error | partial
    error: Optional[str] = None
    email_provider_ids: list[str] = Field(default_factory=list)
    started_at: datetime = Field(default_factory=_now)
    finished_at: Optional[datetime] = None


# ── Template presets shown to the user when creating a config ────────────

TEMPLATE_PRESETS = {
    "ceo": {
        "name": "Rapport CEO",
        "description": "Vue 360° : taux de recouvrement, reste à recouvrer, top clients, risques critiques",
        "sections": ReportSections(
            kpis=True, aging=True, top_clients=True,
            activities=True, clients_at_risk=True, ai_suggestions=True,
        ),
    },
    "cfo": {
        "name": "Rapport CFO",
        "description": "Cash flow, DSO, aging buckets, prévisions",
        "sections": ReportSections(
            kpis=True, aging=True, top_clients=True,
            activities=False, clients_at_risk=True, ai_suggestions=True,
        ),
    },
    "chef_dep": {
        "name": "Rapport Chef de département",
        "description": "Performance par activité, top clients du département",
        "sections": ReportSections(
            kpis=True, aging=False, top_clients=True,
            activities=True, clients_at_risk=True, ai_suggestions=False,
        ),
    },
    "chef_projet": {
        "name": "Rapport Chef de projet",
        "description": "Clients du portefeuille, relances à faire",
        "sections": ReportSections(
            kpis=True, aging=False, top_clients=True,
            activities=False, clients_at_risk=True, ai_suggestions=False,
        ),
    },
}
