"""Per-organisation app settings."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
import uuid


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.utcnow()


class TeamMember(BaseModel):
    id: str = Field(default_factory=_uuid)
    name: str
    role: str
    email: str


class ScoringWeights(BaseModel):
    delaiMoyen: int = 30
    tauxPaye: int = 25
    ancienneteImpayes: int = 20
    encoursRelatif: int = 15
    nbRelances: int = 10


class ScoreThresholds(BaseModel):
    bon: int = 80
    moyen: int = 50
    risque: int = 30


class AlertThresholds(BaseModel):
    echeanceJours: int = 7
    relanceEmail: int = 30
    relanceAppel: int = 60
    relanceRdv: int = 90
    relanceAvocat: int = 180
    encoursMinEscalade: int = 50000


class AgingBuckets(BaseModel):
    """Aging classification bounds (inclusive) in days overdue.
    Normal <= normal, Vigilance <= vigilance, Critique <= critique, Danger beyond.
    """
    normal: int = 30
    vigilance: int = 60
    critique: int = 90


class AppSettings(BaseModel):
    org_id: str
    scoringWeights: ScoringWeights = Field(default_factory=ScoringWeights)
    scoreThresholds: ScoreThresholds = Field(default_factory=ScoreThresholds)
    alertThresholds: AlertThresholds = Field(default_factory=AlertThresholds)
    agingBuckets: AgingBuckets = Field(default_factory=AgingBuckets)
    team: list[TeamMember] = Field(default_factory=list)
    companyName: str = "MEDIANET"
    logoBase64: Optional[str] = None
    currencyFormat: str = "DT"
    updated_at: datetime = Field(default_factory=_now)


class AppSettingsUpdate(BaseModel):
    """Used for PATCH — all fields optional."""
    scoringWeights: Optional[ScoringWeights] = None
    scoreThresholds: Optional[ScoreThresholds] = None
    alertThresholds: Optional[AlertThresholds] = None
    agingBuckets: Optional[AgingBuckets] = None
    team: Optional[list[TeamMember]] = None
    companyName: Optional[str] = None
    logoBase64: Optional[str] = None
    currencyFormat: Optional[str] = None
