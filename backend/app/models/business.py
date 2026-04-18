"""Business domain models: Client, Facture, Action."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
import uuid
from app.models.enums import ActionType, ActionStatut, ActionPriorite


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.utcnow()


def normalize_name(name: str) -> str:
    """Normalise a client name for dedup: lowercase + trim + collapse whitespace."""
    return " ".join((name or "").lower().split())


# ─── Client ──────────────────────────────────────────────────────────
class ClientIn(BaseModel):
    nom: str
    montantDu: float


class Client(BaseModel):
    id: str = Field(default_factory=_uuid)
    org_id: str
    nom: str
    nom_normalized: str
    montantDu: float
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class ClientPublic(BaseModel):
    id: str
    nom: str
    montantDu: float
    updated_at: datetime


# ─── Facture ─────────────────────────────────────────────────────────
class FactureIn(BaseModel):
    nomClient: str
    activite: str = ""
    numFacture: str
    datePaiement: Optional[str] = None
    dateFacture: str = ""
    echeancePrevue: str = ""
    devise: str = ""
    paiement: str = ""
    horsTaxes: float = 0.0
    montantDevise: float = 0.0
    isCustomerGroup: bool = False
    montantRecouvrement: float = 0.0
    montantRecouvre: float = 0.0
    totalTTC: float = 0.0


class Facture(BaseModel):
    id: str = Field(default_factory=_uuid)
    org_id: str
    nomClient: str
    activite: str = ""
    numFacture: str
    datePaiement: Optional[str] = None
    dateFacture: str = ""
    echeancePrevue: str = ""
    devise: str = ""
    paiement: str = ""
    horsTaxes: float = 0.0
    montantDevise: float = 0.0
    isCustomerGroup: bool = False
    montantRecouvrement: float = 0.0
    montantRecouvre: float = 0.0
    totalTTC: float = 0.0
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class FacturePublic(BaseModel):
    """Client-facing facture (mirrors the frontend data model)."""
    id: str
    nomClient: str
    activite: str
    numFacture: str
    datePaiement: Optional[str]
    dateFacture: str
    echeancePrevue: str
    devise: str
    paiement: str
    horsTaxes: float
    montantDevise: float
    isCustomerGroup: bool
    montantRecouvrement: float
    montantRecouvre: float
    totalTTC: float


# ─── Action ──────────────────────────────────────────────────────────
class ActionIn(BaseModel):
    clientNom: str
    factureId: Optional[str] = None
    type: ActionType
    priorite: ActionPriorite = ActionPriorite.MOYENNE
    assigneA: str = ""
    statut: ActionStatut = ActionStatut.A_FAIRE
    datePrevue: str
    notes: str = ""
    montantConcerne: float = 0.0


class ActionUpdate(BaseModel):
    type: Optional[ActionType] = None
    priorite: Optional[ActionPriorite] = None
    assigneA: Optional[str] = None
    statut: Optional[ActionStatut] = None
    datePrevue: Optional[str] = None
    notes: Optional[str] = None
    montantConcerne: Optional[float] = None


class Action(BaseModel):
    id: str = Field(default_factory=_uuid)
    org_id: str
    clientNom: str
    factureId: Optional[str] = None
    type: ActionType
    priorite: ActionPriorite
    assigneA: str = ""
    statut: ActionStatut
    datePrevue: str
    dateCreation: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    source: str = "manuel"  # manuel | ia | alerte_auto
    notes: str = ""
    montantConcerne: float = 0.0
    created_by: str = ""  # user_id
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class ActionPublic(BaseModel):
    id: str
    clientNom: str
    factureId: Optional[str]
    type: ActionType
    priorite: ActionPriorite
    assigneA: str
    statut: ActionStatut
    datePrevue: str
    dateCreation: str
    source: str
    notes: str
    montantConcerne: float
