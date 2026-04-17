import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getActions, saveActions, getSoldeClients, getActiveFactures } from "@/lib/storage";
import { getPaymentStatus, computeEcheance } from "@/types/data";
import type { ActionRelance, Facture } from "@/types/data";
import {
  Plus, Mail, Phone, Users, FileText, Search, CheckCircle2, Clock, AlertTriangle,
  CalendarDays, Lightbulb, Bell, Pencil, Check, Gavel, MoreHorizontal, Sparkles
} from "lucide-react";

function formatTND(n: number) {
  return new Intl.NumberFormat("fr-TN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const typeConfig: Record<ActionRelance["type"], { label: string; icon: typeof Mail }> = {
  email: { label: "Email", icon: Mail },
  appel: { label: "Appel", icon: Phone },
  rdv: { label: "RDV", icon: Users },
  avocat: { label: "Avocat", icon: Gavel },
  autre: { label: "Autre", icon: MoreHorizontal },
};

const prioriteConfig: Record<ActionRelance["priorite"], { label: string; className: string }> = {
  haute: { label: "Haute", className: "bg-destructive/10 text-destructive border-destructive/20" },
  moyenne: { label: "Moyenne", className: "bg-warning/10 text-warning border-warning/20" },
  basse: { label: "Basse", className: "bg-muted text-muted-foreground border-border" },
};

const statutConfig: Record<ActionRelance["statut"], { label: string; className: string }> = {
  "à faire": { label: "À faire", className: "bg-primary/10 text-primary border-primary/20" },
  "en cours": { label: "En cours", className: "bg-warning/10 text-warning border-warning/20" },
  "fait": { label: "Fait", className: "bg-success/10 text-success border-success/20" },
  "annulé": { label: "Annulé", className: "bg-muted text-muted-foreground border-border" },
};

const emptyForm = (): Omit<ActionRelance, "id"> => ({
  clientNom: "",
  factureId: null,
  type: "email",
  priorite: "moyenne",
  assigneA: "",
  statut: "à faire",
  datePrevue: new Date().toISOString().split("T")[0],
  dateCreation: new Date().toISOString(),
  source: "manuel",
  notes: "",
  montantConcerne: 0,
});

interface AISuggestion {
  clientNom: string;
  raison: string;
  actionSuggeree: string;
  type: ActionRelance["type"];
  priorite: ActionRelance["priorite"];
  montantRisque: number;
}

interface AutoAlert {
  icon: typeof AlertTriangle;
  title: string;
  description: string;
  clientNom: string;
  factureId?: string;
  montant: number;
}

export default function Actions() {
  const [actions, setActions] = useState<ActionRelance[]>(getActions());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<ActionRelance, "id">>(emptyForm());

  // Filters
  const [fType, setFType] = useState("all");
  const [fPriorite, setFPriorite] = useState("all");
  const [fStatut, setFStatut] = useState("all");
  const [fAssigne, setFAssigne] = useState("all");
  const [fClient, setFClient] = useState("");
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo, setFDateTo] = useState("");

  const clients = useMemo(() => getSoldeClients(), []);
  const clientNames = useMemo(() => clients.map(c => c.nom).sort(), [clients]);
  const factures = useMemo(() => getActiveFactures(), []);
  const today = new Date().toISOString().split("T")[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  // Assignees from existing actions
  const assignees = useMemo(() => {
    const set = new Set<string>();
    actions.forEach(a => { if (a.assigneA?.trim()) set.add(a.assigneA.trim()); });
    return Array.from(set).sort();
  }, [actions]);

  // KPIs
  const kpis = useMemo(() => {
    const todayActions = actions.filter(a => a.datePrevue === today && (a.statut === "à faire" || a.statut === "en cours")).length;
    const overdue = actions.filter(a => a.datePrevue < today && (a.statut === "à faire" || a.statut === "en cours")).length;
    const thisWeek = actions.filter(a => a.datePrevue >= today && a.datePrevue <= weekEnd && (a.statut === "à faire" || a.statut === "en cours")).length;
    const completedMonth = actions.filter(a => a.statut === "fait" && a.dateCreation >= monthStart).length;
    return { todayActions, overdue, thisWeek, completedMonth };
  }, [actions, today, weekEnd, monthStart]);

  // Filtered actions
  const filtered = useMemo(() => {
    return actions.filter(a => {
      if (fType !== "all" && a.type !== fType) return false;
      if (fPriorite !== "all" && a.priorite !== fPriorite) return false;
      if (fStatut !== "all" && a.statut !== fStatut) return false;
      if (fAssigne !== "all" && a.assigneA !== fAssigne) return false;
      if (fClient && !a.clientNom.toLowerCase().includes(fClient.toLowerCase())) return false;
      if (fDateFrom && a.datePrevue < fDateFrom) return false;
      if (fDateTo && a.datePrevue > fDateTo) return false;
      return true;
    }).sort((a, b) => {
      const pOrd = { haute: 0, moyenne: 1, basse: 2 };
      const sOrd = { "à faire": 0, "en cours": 1, "fait": 2, "annulé": 3 };
      if (sOrd[a.statut] !== sOrd[b.statut]) return sOrd[a.statut] - sOrd[b.statut];
      if (pOrd[a.priorite] !== pOrd[b.priorite]) return pOrd[a.priorite] - pOrd[b.priorite];
      return a.datePrevue.localeCompare(b.datePrevue);
    });
  }, [actions, fType, fPriorite, fStatut, fAssigne, fClient, fDateFrom, fDateTo]);

  // AI Suggestions
  const suggestions = useMemo(() => {
    const now = new Date();
    const result: AISuggestion[] = [];
    const clientMap: Record<string, { unpaidFactures: (Facture & { daysOverdue: number; echeance: string })[], solde: number }> = {};

    const unpaidFactures = factures.filter(f => {
      const s = getPaymentStatus(f.paiement);
      return s === "unpaid" || s === "partial";
    });

    unpaidFactures.forEach(f => {
      const key = f.nomClient.toLowerCase().trim();
      if (!clientMap[key]) {
        const c = clients.find(c => c.nom.toLowerCase().trim() === key);
        clientMap[key] = { unpaidFactures: [], solde: c?.montantDu || 0 };
      }
      const ech = computeEcheance(f.echeancePrevue, f.dateFacture);
      const daysOverdue = Math.floor((now.getTime() - new Date(ech).getTime()) / (1000 * 60 * 60 * 24));
      clientMap[key].unpaidFactures.push({ ...f, daysOverdue, echeance: ech });
    });

    Object.entries(clientMap).forEach(([key, { unpaidFactures: ufs, solde }]) => {
      const clientName = ufs[0]?.nomClient || key;
      const clientActions = actions.filter(a => a.clientNom.toLowerCase().trim() === key);
      const hasEmail = clientActions.some(a => a.type === "email");
      const hasAppel = clientActions.some(a => a.type === "appel");
      const overdueCount = ufs.filter(f => f.daysOverdue > 0).length;
      const maxOverdue = Math.max(0, ...ufs.map(f => f.daysOverdue));

      // Rule: > 180 days + encours > 50K → avocat
      if (maxOverdue > 180 && solde > 50000) {
        result.push({
          clientNom: clientName, raison: `Factures en retard > 180 jours, encours ${formatTND(solde)} DT`,
          actionSuggeree: "Engager des démarches juridiques", type: "avocat", priorite: "haute",
          montantRisque: solde,
        });
      }
      // Rule: > 90 days + no payment → rdv
      else if (maxOverdue > 90 && !hasAppel) {
        result.push({
          clientNom: clientName, raison: `Factures en retard > 90 jours sans action de suivi`,
          actionSuggeree: "Demander un rendez-vous", type: "rdv", priorite: "haute",
          montantRisque: solde,
        });
      }
      // Rule: > 60 days + previous email → appel
      else if (maxOverdue > 60 && hasEmail) {
        result.push({
          clientNom: clientName, raison: `Relance email déjà envoyée, retard > 60 jours`,
          actionSuggeree: "Relance par téléphone", type: "appel", priorite: "haute",
          montantRisque: solde,
        });
      }
      // Rule: > 30 days + no action → email
      else if (maxOverdue > 30 && clientActions.length === 0) {
        result.push({
          clientNom: clientName, raison: `Retard > 30 jours sans aucune action enregistrée`,
          actionSuggeree: "Envoyer une relance email", type: "email", priorite: "moyenne",
          montantRisque: solde,
        });
      }

      // Rule: 3+ overdue → priority escalation
      if (overdueCount >= 3 && !result.some(r => r.clientNom === clientName && r.priorite === "haute")) {
        result.push({
          clientNom: clientName, raison: `${overdueCount} factures en retard simultanément`,
          actionSuggeree: "Escalade prioritaire — relance urgente", type: "appel", priorite: "haute",
          montantRisque: solde,
        });
      }

      // Rule: client paid last invoice late by > 45 days
      const paidFactures = factures.filter(f => f.nomClient.toLowerCase().trim() === key && getPaymentStatus(f.paiement) === "paid" && f.datePaiement);
      if (paidFactures.length > 0) {
        const latest = paidFactures.sort((a, b) => (b.datePaiement || "").localeCompare(a.datePaiement || ""))[0];
        const ech = new Date(computeEcheance(latest.echeancePrevue, latest.dateFacture));
        const paid = new Date(latest.datePaiement!);
        const delay = Math.floor((paid.getTime() - ech.getTime()) / (1000 * 60 * 60 * 24));
        if (delay > 45 && ufs.length > 0) {
          result.push({
            clientNom: clientName, raison: `Dernier paiement en retard de ${delay} jours — risque de retard récurrent`,
            actionSuggeree: "Surveiller et anticiper les relances", type: "email", priorite: "moyenne",
            montantRisque: solde,
          });
        }
      }
    });

    return result.sort((a, b) => b.montantRisque - a.montantRisque).slice(0, 10);
  }, [factures, clients, actions]);

  // Auto Alerts
  const autoAlerts = useMemo(() => {
    const now = new Date();
    const alerts: AutoAlert[] = [];

    // Factures due in 7 days with no action
    factures.forEach(f => {
      const s = getPaymentStatus(f.paiement);
      if (s !== "unpaid" && s !== "partial") return;
      const ech = new Date(computeEcheance(f.echeancePrevue, f.dateFacture));
      const daysLeft = Math.floor((ech.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft >= 0 && daysLeft <= 7) {
        const hasAction = actions.some(a => a.factureId === f.numFacture || a.clientNom.toLowerCase() === f.nomClient.toLowerCase().trim());
        if (!hasAction) {
          alerts.push({
            icon: Clock, title: "Échéance proche",
            description: `Facture ${f.numFacture} échoit dans ${daysLeft} jours — aucune action prévue`,
            clientNom: f.nomClient, factureId: f.numFacture, montant: f.totalTTC,
          });
        }
      }
    });

    // Clients > 500K without action this month
    clients.forEach(c => {
      if (c.montantDu > 500000) {
        const recentAction = actions.some(a => a.clientNom.toLowerCase().trim() === c.nom.toLowerCase().trim() && a.dateCreation >= monthStart);
        if (!recentAction) {
          alerts.push({
            icon: AlertTriangle, title: "Encours élevé sans suivi",
            description: `${c.nom} a un encours de ${formatTND(c.montantDu)} DT sans action ce mois`,
            clientNom: c.nom, montant: c.montantDu,
          });
        }
      }
    });

    // Partial invoices > 60 days
    factures.forEach(f => {
      if (getPaymentStatus(f.paiement) !== "partial") return;
      const d = new Date(f.dateFacture);
      const daysSince = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince > 60) {
        alerts.push({
          icon: CalendarDays, title: "Paiement partiel ancien",
          description: `Facture ${f.numFacture} partiellement payée depuis ${daysSince} jours`,
          clientNom: f.nomClient, factureId: f.numFacture, montant: f.totalTTC - f.montantRecouvre,
        });
      }
    });

    // Clients with no payment > 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const clientsWithPayment = new Set<string>();
    factures.forEach(f => {
      if (getPaymentStatus(f.paiement) === "paid" && f.datePaiement && new Date(f.datePaiement) >= sixMonthsAgo) {
        clientsWithPayment.add(f.nomClient.toLowerCase().trim());
      }
    });
    clients.forEach(c => {
      if (c.montantDu > 0 && !clientsWithPayment.has(c.nom.toLowerCase().trim())) {
        const hasInvoices = factures.some(f => f.nomClient.toLowerCase().trim() === c.nom.toLowerCase().trim());
        if (hasInvoices) {
          alerts.push({
            icon: AlertTriangle, title: "Sans paiement depuis 6+ mois",
            description: `${c.nom} n'a effectué aucun paiement depuis plus de 6 mois`,
            clientNom: c.nom, montant: c.montantDu,
          });
        }
      }
    });

    return alerts.sort((a, b) => b.montant - a.montant).slice(0, 15);
  }, [factures, clients, actions, monthStart]);

  const persist = (updated: ActionRelance[]) => {
    setActions(updated);
    saveActions(updated);
  };

  const openNew = (prefill?: Partial<Omit<ActionRelance, "id">>) => {
    setEditingId(null);
    setForm({ ...emptyForm(), ...prefill });
    setModalOpen(true);
  };

  const openEdit = (a: ActionRelance) => {
    setEditingId(a.id);
    const { id, ...rest } = a;
    setForm(rest);
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.clientNom) return;
    if (editingId) {
      persist(actions.map(a => a.id === editingId ? { ...form, id: editingId } : a));
    } else {
      persist([{ ...form, id: crypto.randomUUID(), dateCreation: new Date().toISOString() }, ...actions]);
    }
    setModalOpen(false);
  };

  const markDone = (id: string) => {
    persist(actions.map(a => a.id === id ? { ...a, statut: "fait" as const } : a));
  };

  const createFromSuggestion = (s: AISuggestion) => {
    openNew({
      clientNom: s.clientNom,
      type: s.type,
      priorite: s.priorite,
      notes: s.actionSuggeree + " — " + s.raison,
      montantConcerne: s.montantRisque,
      source: "ia",
    });
  };

  const createFromAlert = (a: AutoAlert) => {
    openNew({
      clientNom: a.clientNom,
      factureId: a.factureId || null,
      notes: a.description,
      montantConcerne: a.montant,
      source: "alerte_auto",
      priorite: "haute",
    });
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-foreground">Actions & Relances</h2>
        <Button onClick={() => openNew()}>
          <Plus className="h-4 w-4 mr-2" />Nouvelle action
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "À faire aujourd'hui", value: kpis.todayActions, icon: CalendarDays, color: "text-primary" },
          { label: "En retard", value: kpis.overdue, icon: AlertTriangle, color: "text-destructive" },
          { label: "Cette semaine", value: kpis.thisWeek, icon: Clock, color: "text-warning" },
          { label: "Complétées ce mois", value: kpis.completedMonth, icon: CheckCircle2, color: "text-success" },
        ].map(kpi => (
          <Card key={kpi.label} className="shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <kpi.icon className={`h-8 w-8 ${kpi.color}`} />
              <div>
                <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter bar */}
      <Card className="shadow-sm">
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <Select value={fType} onValueChange={setFType}>
            <SelectTrigger className="w-28 h-8 text-sm"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous types</SelectItem>
              {Object.entries(typeConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fPriorite} onValueChange={setFPriorite}>
            <SelectTrigger className="w-28 h-8 text-sm"><SelectValue placeholder="Priorité" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              <SelectItem value="haute">Haute</SelectItem>
              <SelectItem value="moyenne">Moyenne</SelectItem>
              <SelectItem value="basse">Basse</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fStatut} onValueChange={setFStatut}>
            <SelectTrigger className="w-28 h-8 text-sm"><SelectValue placeholder="Statut" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="à faire">À faire</SelectItem>
              <SelectItem value="en cours">En cours</SelectItem>
              <SelectItem value="fait">Fait</SelectItem>
              <SelectItem value="annulé">Annulé</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fAssigne} onValueChange={setFAssigne}>
            <SelectTrigger className="w-32 h-8 text-sm"><SelectValue placeholder="Assigné" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              {assignees.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative w-44">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Client…" className="pl-8 h-8 text-sm" value={fClient} onChange={e => setFClient(e.target.value)} />
          </div>
          <Input type="date" className="w-36 h-8 text-sm" value={fDateFrom} onChange={e => setFDateFrom(e.target.value)} />
          <Input type="date" className="w-36 h-8 text-sm" value={fDateTo} onChange={e => setFDateTo(e.target.value)} />
        </CardContent>
      </Card>

      {/* Action Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Priorité</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Facture</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date prévue</TableHead>
                <TableHead>Assigné à</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="text-center">Statut</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(a => {
                const pCfg = prioriteConfig[a.priorite];
                const sCfg = statutConfig[a.statut];
                const tCfg = typeConfig[a.type];
                const isOverdue = a.datePrevue < today && (a.statut === "à faire" || a.statut === "en cours");
                return (
                  <TableRow key={a.id} className={isOverdue ? "bg-destructive/5" : ""}>
                    <TableCell><Badge variant="default" className={pCfg.className}>{pCfg.label}</Badge></TableCell>
                    <TableCell className="font-medium text-foreground max-w-[140px] truncate">{a.clientNom}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{a.factureId || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <tCfg.icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm text-foreground">{tCfg.label}</span>
                      </div>
                    </TableCell>
                    <TableCell className={`text-sm ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>{a.datePrevue}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.assigneA || "—"}</TableCell>
                    <TableCell className="text-right font-semibold text-foreground">{formatTND(a.montantConcerne)}</TableCell>
                    <TableCell className="text-center"><Badge variant="default" className={sCfg.className}>{sCfg.label}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{a.notes}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)} title="Modifier">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {(a.statut === "à faire" || a.statut === "en cours") && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-success" onClick={() => markDone(a.id)} title="Marquer fait">
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">Aucune action trouvée</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Suggestions IA</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {suggestions.map((s, i) => (
              <Card key={i} className="shadow-sm border-primary/10">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">{s.clientNom}</span>
                    <Badge variant="default" className={prioriteConfig[s.priorite].className}>{prioriteConfig[s.priorite].label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{s.raison}</p>
                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <Badge variant="outline" className="mr-2">{typeConfig[s.type].label}</Badge>
                      <span className="text-sm font-medium text-foreground">{formatTND(s.montantRisque)} DT</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => createFromSuggestion(s)}>
                      <Plus className="h-3.5 w-3.5 mr-1" />Créer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Auto Alerts */}
      {autoAlerts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-warning" />
            <h3 className="text-lg font-semibold text-foreground">Alertes Automatiques</h3>
            <Badge className="bg-warning/10 text-warning border-warning/20">{autoAlerts.length}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {autoAlerts.map((a, i) => (
              <Card key={i} className="shadow-sm">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <a.icon className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground text-sm">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm font-medium text-foreground">{formatTND(a.montant)} DT</span>
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => createFromAlert(a)}>
                      <Plus className="h-3 w-3 mr-1" />Action
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* New / Edit Action Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier l'action" : "Nouvelle action"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-sm">Client</Label>
                <Select value={form.clientNom} onValueChange={v => setForm(f => ({ ...f, clientNom: v }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner un client" /></SelectTrigger>
                  <SelectContent>
                    {clientNames.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as ActionRelance["type"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(typeConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Priorité</Label>
                <Select value={form.priorite} onValueChange={v => setForm(f => ({ ...f, priorite: v as ActionRelance["priorite"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="haute">Haute</SelectItem>
                    <SelectItem value="moyenne">Moyenne</SelectItem>
                    <SelectItem value="basse">Basse</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Statut</Label>
                <Select value={form.statut} onValueChange={v => setForm(f => ({ ...f, statut: v as ActionRelance["statut"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="à faire">À faire</SelectItem>
                    <SelectItem value="en cours">En cours</SelectItem>
                    <SelectItem value="fait">Fait</SelectItem>
                    <SelectItem value="annulé">Annulé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Date prévue</Label>
                <Input type="date" value={form.datePrevue} onChange={e => setForm(f => ({ ...f, datePrevue: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Assigné à</Label>
                <Input placeholder="Nom…" value={form.assigneA} onChange={e => setForm(f => ({ ...f, assigneA: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">N° Facture (optionnel)</Label>
                <Input placeholder="FAC-XXXX" value={form.factureId || ""} onChange={e => setForm(f => ({ ...f, factureId: e.target.value || null }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Montant concerné (DT)</Label>
                <Input type="number" value={form.montantConcerne} onChange={e => setForm(f => ({ ...f, montantConcerne: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Source</Label>
                <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v as ActionRelance["source"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manuel">Manuel</SelectItem>
                    <SelectItem value="ia">IA</SelectItem>
                    <SelectItem value="alerte_auto">Alerte auto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Notes</Label>
              <Textarea placeholder="Détails de l'action…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <Button onClick={handleSave} className="w-full">
              {editingId ? "Enregistrer les modifications" : "Créer l'action"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
