import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getActiveFactures, getSoldeClients } from "@/lib/storage";
import { getPaymentStatus, computeEcheance, safeParseDate, Facture } from "@/types/data";
import { capInvoicesByClientBalance } from "@/lib/forecast-utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend,
  Cell,
} from "recharts";
import { Search, ChevronDown, ChevronRight, Eye, AlertTriangle, Clock, Calendar, CalendarDays, ArrowRight } from "lucide-react";

function formatTND(n: number) {
  return new Intl.NumberFormat("fr-TN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function formatTNDShort(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toFixed(0);
}

type GroupFilter = "all" | "external" | "group";
type TimeToggle = "week" | "month" | "quarter";

interface EnrichedFacture extends Facture {
  echeanceEffective: string;
  echeanceDate: Date;
  daysRemaining: number;
  expectedAmount: number;
  horizon: "overdue" | "7days" | "30days" | "60days" | "beyond";
}

const horizonConfig = {
  overdue:  { label: "En retard", icon: "🔴", color: "hsl(0 72% 51%)",   badgeClass: "bg-destructive/10 text-destructive border-destructive/20" },
  "7days":  { label: "Cash-in 7 jours", icon: "🟠", color: "hsl(32 95% 44%)",  badgeClass: "bg-warning/10 text-warning border-warning/20" },
  "30days": { label: "Cash-in 30 jours", icon: "🟡", color: "hsl(45 93% 47%)", badgeClass: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  "60days": { label: "Cash-in 60 jours", icon: "🟢", color: "hsl(142 72% 29%)",badgeClass: "bg-success/10 text-success border-success/20" },
  beyond:   { label: "Au-delà de 60 jours", icon: "⚪", color: "hsl(215 16% 47%)", badgeClass: "bg-muted text-muted-foreground border-border" },
};

function getHorizon(daysRemaining: number): EnrichedFacture["horizon"] {
  if (daysRemaining < 0) return "overdue";
  if (daysRemaining <= 7) return "7days";
  if (daysRemaining <= 30) return "30days";
  if (daysRemaining <= 60) return "60days";
  return "beyond";
}

function getReliabilityScore(clientName: string, allFactures: Facture[]): { label: string; className: string; avgDelayDays: number; nbInvoicesAnalyzed: number } {
  const clientFactures = allFactures.filter(
    f => f.nomClient.toLowerCase().trim() === clientName.toLowerCase().trim() &&
      getPaymentStatus(f.paiement) === "paid" &&
      f.datePaiement &&
      f.dateFacture
  );
  if (clientFactures.length === 0) return { label: "Variable", className: "bg-warning/10 text-warning border-warning/20", avgDelayDays: 0, nbInvoicesAnalyzed: 0 };

  const delays = clientFactures.map(f => {
    const dateFac = safeParseDate(f.dateFacture);
    const datePay = safeParseDate(f.datePaiement);
    if (!dateFac || !datePay) return null;
    const echeanceStandard = new Date(dateFac);
    echeanceStandard.setDate(echeanceStandard.getDate() + 60);
    return (datePay.getTime() - echeanceStandard.getTime()) / (1000 * 60 * 60 * 24);
  }).filter((d): d is number => d !== null);

  if (delays.length === 0) return { label: "Variable", className: "bg-warning/10 text-warning border-warning/20", avgDelayDays: 0, nbInvoicesAnalyzed: 0 };

  const avgDelay = delays.reduce((s, d) => s + d, 0) / delays.length;
  const rounded = Math.round(avgDelay);

  if (avgDelay <= 15) return { label: "Fiable", className: "bg-success/10 text-success border-success/20", avgDelayDays: rounded, nbInvoicesAnalyzed: delays.length };
  if (avgDelay <= 60) return { label: "Variable", className: "bg-warning/10 text-warning border-warning/20", avgDelayDays: rounded, nbInvoicesAnalyzed: delays.length };
  if (avgDelay <= 120) return { label: "Risqué", className: "bg-orange-100 text-orange-700 border-orange-200", avgDelayDays: rounded, nbInvoicesAnalyzed: delays.length };
  return { label: "Non fiable", className: "bg-destructive/10 text-destructive border-destructive/20", avgDelayDays: rounded, nbInvoicesAnalyzed: delays.length };
}

export default function Previsions() {
  const [timeToggle, setTimeToggle] = useState<TimeToggle>("week");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [deviseFilter, setDeviseFilter] = useState("all");
  const [activiteFilter, setActiviteFilter] = useState("all");
  const [clientSearch, setClientSearch] = useState("");
  const [expandedHorizons, setExpandedHorizons] = useState<Set<string>>(new Set(["overdue", "7days"]));
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [horizonSearches, setHorizonSearches] = useState<Record<string, string>>({});

  const allFactures = useMemo(() => getActiveFactures(), []);
  const allSolde = useMemo(() => getSoldeClients(), []);

  const enriched = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const unpaid = allFactures.filter(f => {
      const s = getPaymentStatus(f.paiement);
      return s === "unpaid" || s === "partial";
    });

    // Cap by real client balance from Solde_Clients
    const capped = capInvoicesByClientBalance(unpaid, allSolde);

    return capped
      .map(f => {
        const echeanceEffective = computeEcheance(f.echeancePrevue, f.dateFacture);
        const echeanceDate = new Date(echeanceEffective);
        const daysRemaining = Math.floor((echeanceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const expectedAmount = f.montantRecouvrement > 0 ? f.montantRecouvrement : (f.totalTTC - f.montantRecouvre);
        return {
          ...f,
          echeanceEffective,
          echeanceDate,
          daysRemaining,
          expectedAmount: Math.max(0, expectedAmount),
          horizon: getHorizon(daysRemaining),
        } as EnrichedFacture;
      })
      .filter(f => {
        if (groupFilter === "external" && f.isCustomerGroup) return false;
        if (groupFilter === "group" && !f.isCustomerGroup) return false;
        if (deviseFilter === "local" && f.devise?.toUpperCase().trim() !== "TND") return false;
        if (deviseFilter === "export" && f.devise?.toUpperCase().trim() === "TND") return false;
        if (activiteFilter !== "all" && !f.activite?.toUpperCase().includes(activiteFilter)) return false;
        if (clientSearch && !f.nomClient.toLowerCase().includes(clientSearch.toLowerCase())) return false;
        return true;
      });
  }, [allFactures, allSolde, groupFilter, deviseFilter, activiteFilter, clientSearch]);

  // Split into overdue vs future
  const overdueInvoices = useMemo(() => enriched.filter(f => f.daysRemaining < 0), [enriched]);
  const futureInvoices = useMemo(() => enriched.filter(f => f.daysRemaining >= 0), [enriched]);

  const overdueTotal = useMemo(() => overdueInvoices.reduce((s, f) => s + f.expectedAmount, 0), [overdueInvoices]);
  const overdueClients = useMemo(() => new Set(overdueInvoices.map(f => f.nomClient.toLowerCase().trim())).size, [overdueInvoices]);

  // Section 1 — Timeline chart data (FUTURE ONLY)
  const timelineData = useMemo(() => {
    const getBucketKey = (d: Date) => {
      if (timeToggle === "week") {
        const start = new Date(d);
        start.setDate(start.getDate() - start.getDay() + 1);
        return start.toISOString().split("T")[0];
      }
      if (timeToggle === "month") return d.toISOString().substring(0, 7);
      const q = Math.floor(d.getMonth() / 3);
      return `${d.getFullYear()}-Q${q + 1}`;
    };

    const getBucketLabel = (key: string) => {
      if (timeToggle === "week") {
        const d = new Date(key);
        return `Sem. ${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}`;
      }
      if (timeToggle === "month") {
        const d = new Date(key + "-01");
        return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
      }
      return key;
    };

    const buckets: Record<string, { soon: number; mid: number; far: number; gray: number; clients: Set<string>; invoiceCount: number }> = {};

    futureInvoices.forEach(f => {
      const key = getBucketKey(f.echeanceDate);
      if (!buckets[key]) buckets[key] = { soon: 0, mid: 0, far: 0, gray: 0, clients: new Set(), invoiceCount: 0 };
      buckets[key].clients.add(f.nomClient);
      buckets[key].invoiceCount++;
      if (f.daysRemaining <= 7) buckets[key].soon += f.expectedAmount;
      else if (f.daysRemaining <= 30) buckets[key].mid += f.expectedAmount;
      else if (f.daysRemaining <= 60) buckets[key].far += f.expectedAmount;
      else buckets[key].gray += f.expectedAmount;
    });

    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, timeToggle === "week" ? 13 : timeToggle === "month" ? 4 : 4)
      .map(([key, vals]) => ({
        name: getBucketLabel(key),
        soon: vals.soon,
        mid: vals.mid,
        far: vals.far,
        gray: vals.gray,
        clients: vals.clients.size,
        invoiceCount: vals.invoiceCount,
      }));
  }, [futureInvoices, timeToggle]);

  // Section 2 — Horizon groups, grouped by client
  interface ClientGroup {
    name: string;
    invoices: EnrichedFacture[];
    totalAmount: number;
    nbInvoices: number;
    oldestDays: number;
    avgDays: number;
    isGroup: boolean;
    reliability: ReturnType<typeof getReliabilityScore>;
  }

  const horizonClientGroups = useMemo(() => {
    const groups: Record<string, ClientGroup[]> = {
      overdue: [], "7days": [], "30days": [], "60days": [], beyond: [],
    };

    // Group enriched invoices by horizon, then by client within each horizon
    const byHorizon: Record<string, EnrichedFacture[]> = {
      overdue: [], "7days": [], "30days": [], "60days": [], beyond: [],
    };
    enriched.forEach(f => byHorizon[f.horizon].push(f));

    Object.entries(byHorizon).forEach(([horizon, invoices]) => {
      const byClient = new Map<string, EnrichedFacture[]>();
      invoices.forEach(f => {
        const key = f.nomClient.toLowerCase().trim();
        if (!byClient.has(key)) byClient.set(key, []);
        byClient.get(key)!.push(f);
      });

      groups[horizon] = Array.from(byClient.entries()).map(([, clientInvs]) => {
        const sorted = [...clientInvs].sort((a, b) => a.daysRemaining - b.daysRemaining);
        const totalAmount = sorted.reduce((s, f) => s + f.expectedAmount, 0);
        const delays = sorted.map(f => Math.abs(f.daysRemaining));
        const avgDays = delays.length > 0 ? Math.round(delays.reduce((s, d) => s + d, 0) / delays.length) : 0;
        const oldestDays = horizon === "overdue"
          ? Math.max(...sorted.map(f => Math.abs(f.daysRemaining)))
          : Math.min(...sorted.map(f => f.daysRemaining));

        return {
          name: sorted[0].nomClient,
          invoices: sorted,
          totalAmount,
          nbInvoices: sorted.length,
          oldestDays,
          avgDays,
          isGroup: sorted[0].isCustomerGroup,
          reliability: getReliabilityScore(sorted[0].nomClient, allFactures),
        };
      }).sort((a, b) => b.totalAmount - a.totalAmount);
    });

    return groups;
  }, [enriched, allFactures]);

  // Section 3 — Activity breakdown
  const activityData = useMemo(() => {
    const map: Record<string, { overdue: number; soon: number; mid: number; far: number; beyond: number }> = {};
    enriched.forEach(f => {
      const act = f.activite?.trim() || "AUTRE";
      if (!map[act]) map[act] = { overdue: 0, soon: 0, mid: 0, far: 0, beyond: 0 };
      if (f.horizon === "overdue") map[act].overdue += f.expectedAmount;
      else if (f.horizon === "7days") map[act].soon += f.expectedAmount;
      else if (f.horizon === "30days") map[act].mid += f.expectedAmount;
      else if (f.horizon === "60days") map[act].far += f.expectedAmount;
      else map[act].beyond += f.expectedAmount;
    });
    return Object.entries(map)
      .map(([act, vals]) => ({ activite: act, ...vals }))
      .sort((a, b) => (b.overdue + b.soon + b.mid + b.far + b.beyond) - (a.overdue + a.soon + a.mid + a.far + a.beyond));
  }, [enriched]);

  // Section 4 — Reliability
  const reliabilityClients = useMemo(() => {
    const clientMap: Record<string, { total: number; count: number }> = {};
    enriched.forEach(f => {
      const key = f.nomClient.toLowerCase().trim();
      if (!clientMap[key]) clientMap[key] = { total: 0, count: 0 };
      clientMap[key].total += f.expectedAmount;
      clientMap[key].count++;
    });
    return Object.entries(clientMap)
      .map(([key, { total, count }]) => {
        const name = enriched.find(f => f.nomClient.toLowerCase().trim() === key)!.nomClient;
        const score = getReliabilityScore(name, allFactures);
        return { name, total, count, score };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
  }, [enriched, allFactures]);

  // Unique activités for filter
  const activites = useMemo(() => {
    const set = new Set<string>();
    allFactures.forEach(f => { if (f.activite?.trim()) set.add(f.activite.trim().toUpperCase()); });
    return Array.from(set).sort();
  }, [allFactures]);

  const toggleHorizon = (h: string) => {
    setExpandedHorizons(prev => {
      const next = new Set(prev);
      next.has(h) ? next.delete(h) : next.add(h);
      return next;
    });
  };

  const totalExpected = enriched.reduce((s, f) => s + f.expectedAmount, 0);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header + Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Prévisions de Trésorerie</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {enriched.length} factures · Total attendu: {formatTND(totalExpected)} DT
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-muted rounded-lg p-1">
            {([["all", "Tous"], ["external", "Hors Groupe"], ["group", "Groupe Medianet"]] as const).map(([val, label]) => (
              <button key={val} onClick={() => setGroupFilter(val)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${groupFilter === val ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {label}
              </button>
            ))}
          </div>
          <Select value={deviseFilter} onValueChange={setDeviseFilter}>
            <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes devises</SelectItem>
              <SelectItem value="local">Local (TND)</SelectItem>
              <SelectItem value="export">Export</SelectItem>
            </SelectContent>
          </Select>
          <Select value={activiteFilter} onValueChange={setActiviteFilter}>
            <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes activités</SelectItem>
              {activites.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Client…" className="pl-8 h-8 text-sm" value={clientSearch} onChange={e => setClientSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* OVERDUE KPI CARD */}
      {overdueInvoices.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5 shadow-sm">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-sm font-semibold text-destructive">Encours en retard</p>
                <p className="text-xs text-muted-foreground">{overdueClients} clients · {overdueInvoices.length} factures</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xl font-bold text-destructive">{formatTND(overdueTotal)} DT</span>
              <Button variant="outline" size="sm" className="text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => { const el = document.getElementById("horizon-overdue"); el?.scrollIntoView({ behavior: "smooth" }); }}>
                Voir le détail <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION 1 — Timeline Chart (FUTURE ONLY) */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Encaissements Prévus — Prochains mois</CardTitle>
            <div className="flex bg-muted rounded-lg p-0.5">
              {([["week", "Semaine"], ["month", "Mois"], ["quarter", "Trimestre"]] as const).map(([val, label]) => (
                <button key={val} onClick={() => setTimeToggle(val)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${timeToggle === val ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {timelineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={timelineData} barCategoryGap="15%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" tickFormatter={v => formatTNDShort(v)} />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0]?.payload;
                    const total = (data?.soon || 0) + (data?.mid || 0) + (data?.far || 0) + (data?.gray || 0);
                    return (
                      <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                        <p className="font-semibold text-foreground mb-1">{label}</p>
                        <p className="text-foreground">Montant attendu: <span className="font-bold">{formatTND(total)} DT</span></p>
                        <p className="text-muted-foreground">Clients: {data?.clients || 0} · Factures: {data?.invoiceCount || 0}</p>
                        <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                          {data?.soon > 0 && <p>🟠 ≤ 7j: {formatTND(data.soon)} DT</p>}
                          {data?.mid > 0 && <p>🟡 8-30j: {formatTND(data.mid)} DT</p>}
                          {data?.far > 0 && <p>🟢 31-60j: {formatTND(data.far)} DT</p>}
                          {data?.gray > 0 && <p>⚪ &gt; 60j: {formatTND(data.gray)} DT</p>}
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend formatter={(v: string) => {
                  const labels: Record<string, string> = { soon: "≤ 7j", mid: "8-30j", far: "31-60j", gray: "> 60j" };
                  return labels[v] || v;
                }} />
                <Bar dataKey="soon" stackId="a" fill="hsl(32 95% 44%)" />
                <Bar dataKey="mid" stackId="a" fill="hsl(45 93% 47%)" />
                <Bar dataKey="far" stackId="a" fill="hsl(142 72% 29%)" />
                <Bar dataKey="gray" stackId="a" fill="hsl(215 16% 47%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-12">Aucune facture future. Toutes les échéances sont en retard.</p>
          )}
        </CardContent>
      </Card>

      {/* SECTION 2 — Horizon Tables (Client-Grouped) */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-foreground">Détail par horizon</h3>
        {(["overdue", "7days", "30days", "60days", "beyond"] as const).map(h => {
          const cfg = horizonConfig[h];
          const clients = horizonClientGroups[h];
          const horizonSearch = horizonSearches[h] || "";
          const filteredClients = horizonSearch
            ? clients.filter(c => c.name.toLowerCase().includes(horizonSearch.toLowerCase()))
            : clients;
          const sum = clients.reduce((s, c) => s + c.totalAmount, 0);
          const totalInvoices = clients.reduce((s, c) => s + c.nbInvoices, 0);
          const isOpen = expandedHorizons.has(h);
          const isOverdue = h === "overdue";

          const toggleClient = (clientKey: string) => {
            setExpandedClients(prev => {
              const next = new Set(prev);
              next.has(clientKey) ? next.delete(clientKey) : next.add(clientKey);
              return next;
            });
          };

          return (
            <Collapsible key={h} open={isOpen} onOpenChange={() => toggleHorizon(h)}>
              <Card className="shadow-sm" id={`horizon-${h}`}>
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors rounded-t-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{cfg.icon}</span>
                      <span className="font-semibold text-foreground">{cfg.label}</span>
                      <Badge variant="outline" className={cfg.badgeClass}>{clients.length} clients · {totalInvoices} fac.</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-foreground">{formatTND(sum)} DT</span>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="p-0 border-t">
                    {/* Search within horizon */}
                    <div className="px-4 py-2 border-b">
                      <div className="relative w-64">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Rechercher un client…"
                          className="pl-8 h-8 text-sm"
                          value={horizonSearch}
                          onChange={e => setHorizonSearches(prev => ({ ...prev, [h]: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8"></TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead className="text-center">Nb fac.</TableHead>
                            <TableHead>{isOverdue ? "+ ancien retard" : "Prochaine éch."}</TableHead>
                            <TableHead className="text-right">Montant attendu</TableHead>
                            <TableHead className="text-center">{isOverdue ? "Retard moy." : "Délai"}</TableHead>
                            <TableHead className="text-center">Fiabilité</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredClients.map(client => {
                            const clientKey = `${h}-${client.name}`;
                            const isClientOpen = expandedClients.has(clientKey);
                            return (
                              <React.Fragment key={clientKey}>
                                {/* Client summary row */}
                                <TableRow
                                  className="cursor-pointer hover:bg-muted/50"
                                  onClick={() => toggleClient(clientKey)}
                                >
                                  <TableCell className="w-8 px-2">
                                    {isClientOpen
                                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                      : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                  </TableCell>
                                  <TableCell className="font-medium text-foreground">
                                    <div className="flex items-center gap-2">
                                      <span className="max-w-[220px] truncate" title={client.name}>{client.name}</span>
                                      {client.isGroup && <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">Groupe</Badge>}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center text-muted-foreground">{client.nbInvoices}</TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {isOverdue
                                      ? <span className="text-destructive font-medium">{client.oldestDays} jours</span>
                                      : `${client.oldestDays}j`}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold text-foreground">{formatTND(client.totalAmount)} DT</TableCell>
                                  <TableCell className="text-center">
                                    <span className={isOverdue ? "text-destructive font-medium" : client.avgDays <= 7 ? "text-warning font-medium" : "text-muted-foreground"}>
                                      {isOverdue ? `${client.avgDays}j` : `Dans ${client.avgDays}j`}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <TooltipProvider>
                                      <UiTooltip>
                                        <TooltipTrigger>
                                          <Badge variant="default" className={`text-xs ${client.reliability.className}`}>{client.reliability.label}</Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Retard moyen: {client.reliability.avgDelayDays > 0 ? '+' : ''}{client.reliability.avgDelayDays}j</p>
                                          <p>Basé sur {client.reliability.nbInvoicesAnalyzed} factures payées</p>
                                        </TooltipContent>
                                      </UiTooltip>
                                    </TooltipProvider>
                                  </TableCell>
                                </TableRow>

                                {/* Expanded invoice rows */}
                                {isClientOpen && (
                                  <>
                                    <TableRow className="bg-muted/20">
                                      <TableCell></TableCell>
                                      <TableCell className="text-xs font-medium text-muted-foreground">N° Facture</TableCell>
                                      <TableCell className="text-xs font-medium text-muted-foreground text-center">Activité</TableCell>
                                      <TableCell className="text-xs font-medium text-muted-foreground">Date Facture</TableCell>
                                      <TableCell className="text-xs font-medium text-muted-foreground text-right">Échéance</TableCell>
                                      <TableCell className="text-xs font-medium text-muted-foreground text-right">Montant</TableCell>
                                      <TableCell className="text-xs font-medium text-muted-foreground text-center">Jours</TableCell>
                                    </TableRow>
                                    {client.invoices.map(f => (
                                      <TableRow key={f.numFacture} className="bg-muted/10">
                                        <TableCell></TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{f.numFacture}</TableCell>
                                        <TableCell className="text-center">
                                          <Badge variant="outline" className="text-xs">{f.activite || '—'}</Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{f.dateFacture}</TableCell>
                                        <TableCell className={`text-right text-sm ${f.daysRemaining < 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                          {f.echeanceEffective}
                                        </TableCell>
                                        <TableCell className="text-right text-sm font-medium text-foreground">{formatTND(f.expectedAmount)}</TableCell>
                                        <TableCell className="text-center text-sm">
                                          <span className={
                                            f.daysRemaining < 0 ? "text-destructive font-medium" :
                                            f.daysRemaining <= 7 ? "text-warning font-medium" :
                                            f.daysRemaining > 30 ? "text-success" : "text-muted-foreground"
                                          }>
                                            {f.daysRemaining < 0 ? `${Math.abs(f.daysRemaining)}j retard` : `${f.daysRemaining}j`}
                                          </span>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                    {/* Total row for expanded client */}
                                    <TableRow className="bg-muted/30 border-t">
                                      <TableCell></TableCell>
                                      <TableCell colSpan={4} className="text-sm font-semibold text-foreground">
                                        Total {client.name}: {client.nbInvoices} factures
                                      </TableCell>
                                      <TableCell className="text-right text-sm font-bold text-foreground">{formatTND(client.totalAmount)} DT</TableCell>
                                      <TableCell></TableCell>
                                    </TableRow>
                                  </>
                                )}
                              </React.Fragment>
                            );
                          })}
                          {filteredClients.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-muted-foreground py-6">Aucun client</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>

      {/* SECTION 3 — Activity Breakdown */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Répartition par Activité</CardTitle>
        </CardHeader>
        <CardContent>
          {activityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={activityData} layout="vertical" barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" tickFormatter={v => formatTNDShort(v)} />
                <YAxis type="category" dataKey="activite" tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" width={120} />
                <RechartsTooltip formatter={(v: number, name: string) => {
                  const labels: Record<string, string> = { overdue: "En retard", soon: "≤ 7j", mid: "≤ 30j", far: "≤ 60j", beyond: "> 60j" };
                  return [formatTND(v) + " DT", labels[name] || name];
                }} />
                <Legend formatter={(v: string) => {
                  const labels: Record<string, string> = { overdue: "En retard", soon: "≤ 7j", mid: "≤ 30j", far: "≤ 60j", beyond: "> 60j" };
                  return labels[v] || v;
                }} />
                <Bar dataKey="overdue" stackId="a" fill="hsl(0 72% 51%)" />
                <Bar dataKey="soon" stackId="a" fill="hsl(32 95% 44%)" />
                <Bar dataKey="mid" stackId="a" fill="hsl(45 93% 47%)" />
                <Bar dataKey="far" stackId="a" fill="hsl(142 72% 29%)" />
                <Bar dataKey="beyond" stackId="a" fill="hsl(215 16% 47%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-12">Aucune donnée</p>
          )}
        </CardContent>
      </Card>

      {/* SECTION 4 — Reliability Scores */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Indicateurs de fiabilité</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Total attendu (DT)</TableHead>
                <TableHead className="text-center">Factures analysées</TableHead>
                <TableHead className="text-center">Retard moyen</TableHead>
                <TableHead className="text-center">Fiabilité</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reliabilityClients.map(c => (
                <TableRow key={c.name}>
                  <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                  <TableCell className="text-right font-semibold text-foreground">{formatTND(c.total)}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{c.score.nbInvoicesAnalyzed}</TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {c.score.nbInvoicesAnalyzed > 0 ? `${c.score.avgDelayDays > 0 ? '+' : ''}${c.score.avgDelayDays}j` : '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    <TooltipProvider>
                      <UiTooltip>
                        <TooltipTrigger>
                          <Badge variant="default" className={c.score.className}>{c.score.label}</Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Retard moyen: {c.score.avgDelayDays > 0 ? '+' : ''}{c.score.avgDelayDays}j vs Date Facture + 60j</p>
                          <p>Basé sur {c.score.nbInvoicesAnalyzed} factures payées</p>
                        </TooltipContent>
                      </UiTooltip>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
              ))}
              {reliabilityClients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Aucune donnée</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
