"""Shared enums and types used across models."""
from enum import Enum


class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    CEO = "ceo"
    CFO = "cfo"
    CHEF_DEP = "chef_dep"
    CHEF_PROJET = "chef_projet"
    AGENT = "agent"


class PaiementStatus(str, Enum):
    PAID = "paid"
    PARTIAL = "partial"
    UNPAID = "unpaid"


class ActionType(str, Enum):
    EMAIL = "email"
    APPEL = "appel"
    RDV = "rdv"
    AVOCAT = "avocat"
    AUTRE = "autre"


class ActionStatut(str, Enum):
    A_FAIRE = "à faire"
    EN_COURS = "en cours"
    FAIT = "fait"
    ANNULE = "annulé"


class ActionPriorite(str, Enum):
    HAUTE = "haute"
    MOYENNE = "moyenne"
    BASSE = "basse"
