import { useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getActiveFactures, getActions, saveActions } from "@/lib/storage";
import { getPaymentStatus, computeEcheance, ActionRelance } from "@/types/data";
import { Search, Eye, Bell, Download, Filter, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import * as XLSX from "xlsx";

function formatTND(n: number) {
  return new Intl.NumberFormat("fr-TN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

type ExtPaymentStatus = "paid" | "partial" | "unpaid" | "in_payment";

function getExtPaymentStatus(paiement: string): ExtPaymentStatus {
  const p = paiement?.toLowerCase().trim() ?? "";
  if (p === "paid") return "paid";
  if (p === "in_payment") return "in_payment";
  if (p === "partial") return "partial";
  return "unpaid";
}

const statusConfig: Record<ExtPaymentStatus, { label: string; className: string }> = {
  paid: { label: "Payée", className: "bg-success/10 text-success border-success/20" },
  partial: { label: "Partielle", className: "bg-warning/10 text-warning border-warning/20" },
  unpaid: { label: "Non payée", className: "bg-destructive/10 text-destructive border-destructive/20" },
  in_payment: { label: "En paiement", className: "bg-primary/10 text-primary border-primary/20" },
};

const ACTIVITES = ["DIGITAL", "RUN SERVICES", "HOSTING", "PROD", "CONSULTING", "AUTRES PRODUITS", "FORMATION"];

type GroupFilter = "all" | "external" | "group";

interface Filters {
  clientSearch: string;
  activites: string[];
  status: string;
  devise: string;
  montantMin: string;
  montantMax: string;
  dateFrom: string;
  dateTo: string;
  group: GroupFilter;
}

const defaultFilters: Filters = {
  clientSearch: "",
  activites: [],
  status: "all",
  devise: "all",
  montantMin: "",
  montantMax: "",
  dateFrom: "",
  dateTo: "",
  group: "all",
};

export default function Factures() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [showFilters, setShowFilters] = useState(true);
  const [detailFacture, setDetailFacture] = useState<any | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionTarget, setActionTarget] = useState<any | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [actionType, setActionType] = useState<ActionRelance["type"]>("email");

  const allFactures = useMemo(() => {
    return getActiveFactures().map(f => ({
      ...f,
      status: getExtPaymentStatus(f.paiement),
      echeanceEffective: computeEcheance(f.echeancePrevue, f.dateFacture),
      progressPct: f.totalTTC > 0 ? Math.min(100, (f.montantRecouvre / f.totalTTC) * 100) : 0,
    }));
  }, []);

  const filtered = useMemo(() => {
    return allFactures.filter(f => {
      if (filters.clientSearch && !f.nomClient.toLowerCase().includes(filters.clientSearch.toLowerCase())) return false;
      if (filters.activites.length > 0 && !filters.activites.some(a => f.activite?.toUpperCase().includes(a))) return false;
      if (filters.status !== "all") {
        if (filters.status === "in_payment" && f.status !== "in_payment") return false;
        if (filters.status === "paid" && f.status !== "paid") return false;
        if (filters.status === "partial" && f.status !== "partial") return false;
        if (filters.status === "unpaid" && f.status !== "unpaid") return false;
      }
      if (filters.devise === "local" && f.devise?.toUpperCase().trim() !== "TND") return false;
      if (filters.devise === "export" && f.devise?.toUpperCase().trim() === "TND") return false;
      if (filters.montantMin && f.totalTTC < parseFloat(filters.montantMin)) return false;
      if (filters.montantMax && f.totalTTC > parseFloat(filters.montantMax)) return false;
      if (filters.dateFrom && f.dateFacture < filters.dateFrom) return false;
      if (filters.dateTo && f.dateFacture > filters.dateTo) return false;
      if (filters.group === "external" && f.isCustomerGroup) return false;
      if (filters.group === "group" && !f.isCustomerGroup) return false;
      return true;
    });
  }, [allFactures, filters]);

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const toggleActivite = (act: string) => {
    setFilters(prev => ({
      ...prev,
      activites: prev.activites.includes(act) ? prev.activites.filter(a => a !== act) : [...prev.activites, act],
    }));
  };

  const resetFilters = () => setFilters(defaultFilters);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.clientSearch) count++;
    if (filters.activites.length > 0) count++;
    if (filters.status !== "all") count++;
    if (filters.devise !== "all") count++;
    if (filters.montantMin) count++;
    if (filters.montantMax) count++;
    if (filters.dateFrom) count++;
    if (filters.dateTo) count++;
    if (filters.group !== "all") count++;
    return count;
  }, [filters]);

  const exportToXLSX = useCallback(() => {
    const data = filtered.map(f => ({
      "N° Facture": f.numFacture,
      "Client": f.nomClient,
      "Activité": f.activite,
      "Date Facture": f.dateFacture,
      "Échéance": f.echeanceEffective,
      "Devise": f.devise,
      "Total TTC": f.totalTTC,
      "M. Recouvrement": f.montantRecouvrement,
      "Montant Recouvré": f.montantRecouvre,
      "Statut": statusConfig[f.status].label,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Factures");
    XLSX.writeFile(wb, `factures_export_${new Date().toISOString().split("T")[0]}.xlsx`);
  }, [filtered]);

  const handleAddAction = () => {
    if (!actionTarget || !actionNote.trim()) return;
    const actions = getActions();
    const newAction: ActionRelance = {
      id: crypto.randomUUID(),
      clientNom: actionTarget.nomClient,
      factureId: actionTarget.numFacture,
      type: actionType as ActionRelance["type"],
      priorite: "moyenne",
      assigneA: "",
      statut: "à faire",
      datePrevue: new Date().toISOString().split("T")[0],
      dateCreation: new Date().toISOString(),
      source: "manuel",
      notes: actionNote,
      montantConcerne: actionTarget.totalTTC || 0,
    };
    saveActions([...actions, newAction]);
    setShowActionModal(false);
    setActionNote("");
    setActionTarget(null);
  };

  const actions = getActions();

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Factures</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} factures sur {allFactures.length}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4 mr-1" />
            Filtres
            {activeFilterCount > 0 && (
              <Badge className="ml-1 bg-primary text-primary-foreground text-xs h-5 w-5 p-0 flex items-center justify-center rounded-full">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={exportToXLSX}>
            <Download className="h-4 w-4 mr-1" />
            Export XLSX
          </Button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Filter sidebar */}
        {showFilters && (
          <Card className="shadow-sm w-64 shrink-0 self-start">
            <CardContent className="p-4 space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Filtres</span>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters} className="text-xs text-primary hover:underline">Réinitialiser</button>
                )}
              </div>

              {/* Client search */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Client</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Rechercher…" className="pl-8 h-8 text-sm" value={filters.clientSearch} onChange={e => updateFilter("clientSearch", e.target.value)} />
                </div>
              </div>

              {/* Activité */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Activité</Label>
                <div className="space-y-1">
                  {ACTIVITES.map(a => (
                    <label key={a} className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox checked={filters.activites.includes(a)} onCheckedChange={() => toggleActivite(a)} className="h-3.5 w-3.5" />
                      <span className="text-foreground">{a}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Statut */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Statut</Label>
                <Select value={filters.status} onValueChange={v => updateFilter("status", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    <SelectItem value="paid">Payée</SelectItem>
                    <SelectItem value="partial">Partielle</SelectItem>
                    <SelectItem value="unpaid">Non payée</SelectItem>
                    <SelectItem value="in_payment">En paiement</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Devise */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Devise</Label>
                <Select value={filters.devise} onValueChange={v => updateFilter("devise", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    <SelectItem value="local">Local (TND)</SelectItem>
                    <SelectItem value="export">Export (EUR/USD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Montant */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Montant TTC (DT)</Label>
                <div className="flex gap-2">
                  <Input type="number" placeholder="Min" className="h-8 text-sm" value={filters.montantMin} onChange={e => updateFilter("montantMin", e.target.value)} />
                  <Input type="number" placeholder="Max" className="h-8 text-sm" value={filters.montantMax} onChange={e => updateFilter("montantMax", e.target.value)} />
                </div>
              </div>

              {/* Date range */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Date Facture</Label>
                <Input type="date" className="h-8 text-sm" value={filters.dateFrom} onChange={e => updateFilter("dateFrom", e.target.value)} />
                <Input type="date" className="h-8 text-sm" value={filters.dateTo} onChange={e => updateFilter("dateTo", e.target.value)} />
              </div>

              {/* Groupe */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Groupe</Label>
                <Select value={filters.group} onValueChange={v => updateFilter("group", v as GroupFilter)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="external">Hors Groupe</SelectItem>
                    <SelectItem value="group">Groupe Medianet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main table */}
        <Card className="shadow-sm flex-1 min-w-0">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° Facture</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Activité</TableHead>
                  <TableHead>Date Facture</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Devise</TableHead>
                  <TableHead className="text-right">Total TTC</TableHead>
                  <TableHead className="text-right">M. Recouvrement</TableHead>
                  <TableHead className="text-right">Recouvré</TableHead>
                  <TableHead className="text-center">Statut</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 200).map(f => {
                  const cfg = statusConfig[f.status];
                  return (
                    <TableRow key={f.numFacture}>
                      <TableCell className="font-medium text-foreground">{f.numFacture}</TableCell>
                      <TableCell className="text-foreground max-w-[150px] truncate">{f.nomClient}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{f.activite}</TableCell>
                      <TableCell className="text-muted-foreground">{f.dateFacture}</TableCell>
                      <TableCell className="text-muted-foreground">{f.echeanceEffective}</TableCell>
                      <TableCell className="text-muted-foreground">{f.devise}</TableCell>
                      <TableCell className="text-right font-semibold text-foreground">{formatTND(f.totalTTC)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatTND(f.montantRecouvrement)}</TableCell>
                      <TableCell className="text-right">
                        <div className="space-y-1">
                          <span className="text-muted-foreground">{formatTND(f.montantRecouvre)}</span>
                          {f.status === "partial" && (
                            <Progress value={f.progressPct} className="h-1.5 w-16" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="default" className={cfg.className}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetailFacture(f)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setActionTarget(f); setShowActionModal(true); }}>
                            <Bell className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">Aucune facture trouvée</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {filtered.length > 200 && (
        <p className="text-sm text-muted-foreground text-center">Affichage limité aux 200 premières factures sur {filtered.length}.</p>
      )}

      {/* Invoice Detail Sheet */}
      <Sheet open={!!detailFacture} onOpenChange={() => setDetailFacture(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {detailFacture && (
            <>
              <SheetHeader>
                <SheetTitle>Facture {detailFacture.numFacture}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {([
                    ["Client", detailFacture.nomClient],
                    ["Activité", detailFacture.activite],
                    ["Date Facture", detailFacture.dateFacture],
                    ["Échéance", detailFacture.echeanceEffective],
                    ["Devise", detailFacture.devise],
                    ["Hors Taxes", formatTND(detailFacture.horsTaxes) + " DT"],
                    ["Total TTC", formatTND(detailFacture.totalTTC) + " DT"],
                    ["M. Recouvrement", formatTND(detailFacture.montantRecouvrement) + " DT"],
                    ["Montant Recouvré", formatTND(detailFacture.montantRecouvre) + " DT"],
                    ["Montant Devise", formatTND(detailFacture.montantDevise)],
                    ["Groupe", detailFacture.isCustomerGroup ? "Oui" : "Non"],
                    ["Paiement", detailFacture.paiement],
                    ["Date Paiement", detailFacture.datePaiement || "-"],
                  ] as [string, string][]).map(([label, val]) => (
                    <div key={label}>
                      <span className="text-muted-foreground">{label}</span>
                      <p className="font-medium text-foreground">{val}</p>
                    </div>
                  ))}
                </div>

                {/* Progress bar for partial */}
                {detailFacture.status === "partial" && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Recouvrement</span>
                      <span className="font-medium text-foreground">{Math.round(detailFacture.progressPct)}%</span>
                    </div>
                    <Progress value={detailFacture.progressPct} className="h-2" />
                  </div>
                )}

                <Badge variant="default" className={statusConfig[detailFacture.status as ExtPaymentStatus].className}>
                  {statusConfig[detailFacture.status as ExtPaymentStatus].label}
                </Badge>

                {/* Actions history */}
                <div className="pt-4 border-t">
                  <h4 className="font-semibold text-foreground mb-3">Historique des actions</h4>
                  {actions
                    .filter(a => a.factureId === detailFacture.numFacture || a.clientNom.toLowerCase() === detailFacture.nomClient.toLowerCase())
                    .map(a => (
                      <div key={a.id} className="flex items-start gap-2 py-2 border-b last:border-0">
                        <Badge variant="outline" className="text-xs shrink-0">{a.type}</Badge>
                        <div className="min-w-0">
                          <p className="text-sm text-foreground">{a.notes}</p>
                          <p className="text-xs text-muted-foreground">{a.datePrevue}</p>
                        </div>
                      </div>
                    ))}
                  {actions.filter(a => a.factureId === detailFacture.numFacture || a.clientNom.toLowerCase() === detailFacture.nomClient.toLowerCase()).length === 0 && (
                    <p className="text-sm text-muted-foreground">Aucune action enregistrée</p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => { setActionTarget(detailFacture); setShowActionModal(true); }}
                  >
                    <Bell className="h-3.5 w-3.5 mr-1" /> Ajouter une action
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Add Action Modal */}
      <Dialog open={showActionModal} onOpenChange={setShowActionModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter une action</DialogTitle>
          </DialogHeader>
          {actionTarget && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Facture <span className="font-medium text-foreground">{actionTarget.numFacture}</span> — {actionTarget.nomClient}
              </p>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={actionType} onValueChange={v => setActionType(v as ActionRelance["type"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="appel">Téléphone</SelectItem>
                    <SelectItem value="rdv">Réunion</SelectItem>
                    <SelectItem value="avocat">Avocat</SelectItem>
                    <SelectItem value="autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Note</Label>
                <Textarea value={actionNote} onChange={e => setActionNote(e.target.value)} placeholder="Détail de l'action…" />
              </div>
              <Button onClick={handleAddAction} className="w-full">Enregistrer</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
