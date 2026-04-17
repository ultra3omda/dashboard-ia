import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getSoldeClients, getActiveFactures } from "@/lib/storage";
import { getPaymentStatus, computeEcheance } from "@/types/data";
import { Search, ChevronDown, ChevronRight, Users, Eye, ArrowUpDown, ArrowUp, ArrowDown, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

function formatTND(n: number) {
  return new Intl.NumberFormat("fr-TN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

type GroupFilter = "all" | "external" | "group";
type SortKey = "nom" | "montant" | "nbImpayees" | "oldestDays";
type SortDir = "asc" | "desc";
type AIStatusFilter = "all" | "Bon" | "Moyen" | "Risqué" | "Critique";

const statusConfig = {
  paid: { label: "Payée", className: "bg-success/10 text-success border-success/20" },
  partial: { label: "Partielle", className: "bg-warning/10 text-warning border-warning/20" },
  unpaid: { label: "Impayée", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

function getAIStatus(oldestDays: number) {
  if (oldestDays <= 30) return { label: "Bon", className: "bg-success/10 text-success border-success/20" };
  if (oldestDays <= 60) return { label: "Moyen", className: "bg-warning/10 text-warning border-warning/20" };
  if (oldestDays <= 90) return { label: "Risqué", className: "bg-orange-100 text-orange-600 border-orange-200" };
  return { label: "Critique", className: "bg-destructive/10 text-destructive border-destructive/20" };
}

const PAGE_SIZE = 20;

export default function Encours() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialClient = searchParams.get("client");

  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("montant");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [montantMin, setMontantMin] = useState("");
  const [montantMax, setMontantMax] = useState("");
  const [aiFilter, setAiFilter] = useState<AIStatusFilter>("all");
  const [showAll, setShowAll] = useState(false);
  const [expandedClient, setExpandedClient] = useState<string | null>(initialClient);

  const { clients, factures } = useMemo(() => {
    const solde = getSoldeClients();
    const factures = getActiveFactures();
    return { clients: solde, factures };
  }, []);

  const enrichedClients = useMemo(() => {
    const now = new Date();
    return clients
      .filter(c => c.montantDu > 0)
      .map(c => {
        const clientFactures = factures.filter(f => f.nomClient.toLowerCase().trim() === c.nom.toLowerCase().trim());
        const isGroup = clientFactures.some(f => f.isCustomerGroup);
        const unpaidFactures = clientFactures.filter(f => { const s = getPaymentStatus(f.paiement); return s === "unpaid" || s === "partial"; });
        const nbImpayees = unpaidFactures.length;

        let oldestDays = 0;
        unpaidFactures.forEach(f => {
          const d = new Date(f.dateFacture);
          if (!isNaN(d.getTime())) {
            const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
            if (diff > oldestDays) oldestDays = diff;
          }
        });

        const aiStatus = getAIStatus(oldestDays);

        return {
          ...c,
          isGroup,
          nbImpayees,
          oldestDays,
          aiStatus,
          clientFactures,
        };
      });
  }, [clients, factures]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "nom" ? "asc" : "desc");
    }
  };

  const resetFilters = () => {
    setSearch("");
    setGroupFilter("all");
    setMontantMin("");
    setMontantMax("");
    setAiFilter("all");
    setSortKey("montant");
    setSortDir("desc");
  };

  const filtered = useMemo(() => {
    let result = enrichedClients;

    // Group filter
    if (groupFilter === "external") result = result.filter(c => !c.isGroup);
    if (groupFilter === "group") result = result.filter(c => c.isGroup);

    // Search
    if (search) result = result.filter(c => c.nom.toLowerCase().includes(search.toLowerCase()));

    // Montant range
    const min = parseFloat(montantMin);
    const max = parseFloat(montantMax);
    if (!isNaN(min)) result = result.filter(c => c.montantDu >= min);
    if (!isNaN(max)) result = result.filter(c => c.montantDu <= max);

    // AI status filter
    if (aiFilter !== "all") result = result.filter(c => c.aiStatus.label === aiFilter);

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "nom": cmp = a.nom.localeCompare(b.nom, "fr"); break;
        case "montant": cmp = a.montantDu - b.montantDu; break;
        case "nbImpayees": cmp = a.nbImpayees - b.nbImpayees; break;
        case "oldestDays": cmp = a.oldestDays - b.oldestDays; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [enrichedClients, groupFilter, search, montantMin, montantMax, aiFilter, sortKey, sortDir]);

  const totalFiltered = filtered.reduce((s, c) => s + c.montantDu, 0);
  const displayed = showAll ? filtered : filtered.slice(0, PAGE_SIZE);
  const startIdx = 1;
  const endIdx = displayed.length;

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground">Encours Clients</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Affichage de {startIdx} à {endIdx} sur {filtered.length} clients · Total filtré: {formatTND(totalFiltered)} DT
        </p>
      </div>

      {/* Filter Bar */}
      <Card className="shadow-sm">
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative w-52">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Rechercher un client…" className="pl-8 h-8 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {/* Group toggle */}
            <div className="flex bg-muted rounded-lg p-0.5">
              {([["all", "Tous"], ["external", "Hors Groupe"], ["group", "Groupe Medianet"]] as const).map(([val, label]) => (
                <button key={val} onClick={() => setGroupFilter(val)}
                  className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                    groupFilter === val ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}>
                  {label}
                </button>
              ))}
            </div>

            {/* Montant range */}
            <div className="flex items-center gap-1.5">
              <Input placeholder="Min DT" type="number" className="w-24 h-8 text-sm" value={montantMin} onChange={e => setMontantMin(e.target.value)} />
              <span className="text-muted-foreground text-xs">→</span>
              <Input placeholder="Max DT" type="number" className="w-24 h-8 text-sm" value={montantMax} onChange={e => setMontantMax(e.target.value)} />
            </div>

            {/* AI Status */}
            <Select value={aiFilter} onValueChange={v => setAiFilter(v as AIStatusFilter)}>
              <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="Bon">Bon</SelectItem>
                <SelectItem value="Moyen">Moyen</SelectItem>
                <SelectItem value="Risqué">Risqué</SelectItem>
                <SelectItem value="Critique">Critique</SelectItem>
              </SelectContent>
            </Select>

            {/* Reset */}
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={resetFilters}>
              <RotateCcw className="h-3 w-3" /> Réinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("nom")}>
                  <span className="flex items-center">Client <SortIcon col="nom" /></span>
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("montant")}>
                  <span className="flex items-center justify-end">Encours (DT) <SortIcon col="montant" /></span>
                </TableHead>
                <TableHead className="text-center cursor-pointer select-none" onClick={() => handleSort("nbImpayees")}>
                  <span className="flex items-center justify-center">Impayées <SortIcon col="nbImpayees" /></span>
                </TableHead>
                <TableHead className="text-center cursor-pointer select-none" onClick={() => handleSort("oldestDays")}>
                  <span className="flex items-center justify-center">Ancienneté <SortIcon col="oldestDays" /></span>
                </TableHead>
                <TableHead className="text-center">Groupe</TableHead>
                <TableHead className="text-center">Statut IA</TableHead>
                <TableHead className="w-12 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayed.map((c, i) => {
                const isExpanded = expandedClient === c.nom;
                const rank = showAll ? i + 1 : i + 1;
                return (
                  <Collapsible key={c.nom} open={isExpanded} onOpenChange={() => setExpandedClient(isExpanded ? null : c.nom)} asChild>
                    <>
                      <CollapsibleTrigger asChild>
                        <TableRow className="cursor-pointer hover:bg-muted/50">
                          <TableCell className="text-center text-muted-foreground font-medium">{rank}</TableCell>
                          <TableCell className="font-medium text-foreground">{c.nom}</TableCell>
                          <TableCell className="text-right font-semibold text-foreground">{formatTND(c.montantDu)}</TableCell>
                          <TableCell className="text-center">
                            {c.nbImpayees > 0 ? <span className="text-destructive font-medium">{c.nbImpayees}</span> : <span className="text-muted-foreground">0</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {c.oldestDays > 0 ? (
                              <span className={cn("font-medium", c.oldestDays > 90 ? "text-destructive" : "text-muted-foreground")}>{c.oldestDays}j</span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {c.isGroup && <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">Groupe</Badge>}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="default" className={cn("text-xs", c.aiStatus.className)}>{c.aiStatus.label}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); setExpandedClient(isExpanded ? null : c.nom); }}>
                              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      </CollapsibleTrigger>
                      <CollapsibleContent asChild>
                        <TableRow>
                          <TableCell colSpan={8} className="p-0 bg-muted/30">
                            <div className="p-4 space-y-3">
                              <div className="flex items-center gap-3 mb-3">
                                <h3 className="font-semibold text-foreground">{c.nom}</h3>
                                <Badge variant="outline">{formatTND(c.montantDu)} DT</Badge>
                                {c.isGroup && <Badge className="bg-primary/10 text-primary border-primary/20">Groupe Medianet</Badge>}
                              </div>
                              <div className="rounded-lg border overflow-hidden">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>N° Facture</TableHead>
                                      <TableHead>Activité</TableHead>
                                      <TableHead>Date Facture</TableHead>
                                      <TableHead>Échéance</TableHead>
                                      <TableHead>Devise</TableHead>
                                      <TableHead className="text-right">TTC (DT)</TableHead>
                                      <TableHead className="text-right">Recouvré</TableHead>
                                      <TableHead className="text-center">Statut</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {c.clientFactures.map(f => {
                                      const status = getPaymentStatus(f.paiement);
                                      const cfg = statusConfig[status];
                                      return (
                                        <TableRow key={f.numFacture}>
                                          <TableCell className="font-medium text-foreground">{f.numFacture}</TableCell>
                                          <TableCell className="text-muted-foreground">{f.activite}</TableCell>
                                          <TableCell className="text-muted-foreground">{f.dateFacture}</TableCell>
                                          <TableCell className="text-muted-foreground">{computeEcheance(f.echeancePrevue, f.dateFacture)}</TableCell>
                                          <TableCell className="text-muted-foreground">{f.devise}</TableCell>
                                          <TableCell className="text-right font-semibold text-foreground">{formatTND(f.totalTTC)}</TableCell>
                                          <TableCell className="text-right text-muted-foreground">{formatTND(f.montantRecouvre)}</TableCell>
                                          <TableCell className="text-center">
                                            <Badge variant="default" className={cfg.className}>{cfg.label}</Badge>
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">Aucun client trouvé</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {showAll ? `${filtered.length} clients affichés` : `${Math.min(PAGE_SIZE, filtered.length)} sur ${filtered.length} clients`}
          </p>
          <Button variant="outline" size="sm" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Paginer (20)" : "Voir tous"}
          </Button>
        </div>
      )}
    </div>
  );
}
