import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { getSoldeClients, getActiveFactures } from "@/lib/storage";
import { getPaymentStatus, computeEcheance } from "@/types/data";
import type { Facture, SoldeClient } from "@/types/data";
import { capInvoicesByClientBalance } from "@/lib/forecast-utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from "recharts";
import {
  Wallet, TrendingDown, CalendarCheck, AlertTriangle,
  ChevronRight, ArrowRight, Mail, Phone, Users as UsersIcon, FileText, CalendarIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subMonths, startOfMonth, endOfMonth, differenceInDays, isWithinInterval } from "date-fns";
import { fr } from "date-fns/locale";

type GroupFilter = "all" | "external" | "group";

function formatDT(n: number) {
  return new Intl.NumberFormat("fr-TN", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n)) + " DT";
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, differenceInDays(new Date(), d));
}

function getAIStatus(oldestDays: number): { label: string; className: string } {
  if (oldestDays <= 30) return { label: "Bon", className: "bg-success/10 text-success border-success/20" };
  if (oldestDays <= 60) return { label: "Moyen", className: "bg-warning/10 text-warning border-warning/20" };
  if (oldestDays <= 90) return { label: "Risqué", className: "bg-orange-100 text-orange-700 border-orange-200" };
  return { label: "Critique", className: "bg-destructive/10 text-destructive border-destructive/20" };
}

const AGING_BRACKETS = [
  { key: "< 30j", min: 0, max: 29, color: "hsl(142, 72%, 29%)" },
  { key: "30-60j", min: 30, max: 59, color: "hsl(32, 95%, 44%)" },
  { key: "60-90j", min: 60, max: 89, color: "hsl(25, 95%, 53%)" },
  { key: "90-180j", min: 90, max: 179, color: "hsl(0, 72%, 51%)" },
  { key: "180j-1an", min: 180, max: 364, color: "hsl(0, 72%, 35%)" },
  { key: "> 1 an", min: 365, max: 99999, color: "hsl(0, 0%, 30%)" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("external");
  const [showAllClients, setShowAllClients] = useState(false);
  const [agingDrawerBracket, setAgingDrawerBracket] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subMonths(startOfMonth(new Date()), 5),
    to: endOfMonth(new Date()),
  });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [datePickerStep, setDatePickerStep] = useState<"from" | "to">("from");

  const allSolde = useMemo(() => {
    const s = getSoldeClients();
    console.log("[CashFlow] Dashboard: Clients actifs:", s.filter(c => c.montantDu > 0).length);
    console.log("[CashFlow] Dashboard: Encours total:", s.reduce((sum, c) => sum + (c.montantDu > 0 ? c.montantDu : 0), 0));
    return s;
  }, []);
  const allFactures = useMemo(() => {
    const f = getActiveFactures();
    const unpaid = f.filter(f2 => { const st = getPaymentStatus(f2.paiement); return st === "unpaid" || st === "partial"; });
    console.log("[CashFlow] Dashboard: Factures impayées:", unpaid.length);
    console.log("[CashFlow] Dashboard: A recouvrer:", unpaid.reduce((s, f2) => s + f2.montantRecouvrement, 0));
    return f;
  }, []);

  // Build a set of group client names (case-insensitive)
  const groupClientNames = useMemo(() => {
    const set = new Set<string>();
    allFactures.forEach(f => {
      if (f.isCustomerGroup) set.add(f.nomClient.toLowerCase().trim());
    });
    return set;
  }, [allFactures]);

  // Apply group filter
  const filterClient = useMemo(() => {
    return (name: string) => {
      const key = name.toLowerCase().trim();
      if (groupFilter === "external") return !groupClientNames.has(key);
      if (groupFilter === "group") return groupClientNames.has(key);
      return true;
    };
  }, [groupFilter, groupClientNames]);

  const solde = useMemo(() => allSolde.filter(c => filterClient(c.nom)), [allSolde, filterClient]);
  const factures = useMemo(() => allFactures.filter(f => filterClient(f.nomClient)), [allFactures, filterClient]);

  // ─── KPIs ───
  const kpis = useMemo(() => {
    // KPI 1: Total Encours — all clients (no group filter) from Solde_Clients
    const totalEncours = allSolde.reduce((s, c) => s + (c.montantDu > 0 ? c.montantDu : 0), 0);

    // KPI 2: Encours Hors Groupe — from Solde_Clients, excluding group companies
    const encoursHorsGroupe = allSolde
      .filter(c => !groupClientNames.has(c.nom.toLowerCase().trim()))
      .reduce((s, c) => s + (c.montantDu > 0 ? c.montantDu : 0), 0);

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const recouvrementMois = factures
      .filter(f => {
        if (!f.datePaiement) return false;
        const d = new Date(f.datePaiement);
        return !isNaN(d.getTime()) && isWithinInterval(d, { start: monthStart, end: monthEnd });
      })
      .reduce((s, f) => s + f.montantRecouvre, 0);

    // Clients à risque: oldest unpaid invoice > 90 days
    const clientOldest = new Map<string, number>();
    factures.filter(f => getPaymentStatus(f.paiement) === "unpaid").forEach(f => {
      const key = f.nomClient.toLowerCase().trim();
      const days = daysSince(f.dateFacture);
      clientOldest.set(key, Math.max(clientOldest.get(key) || 0, days));
    });
    const clientsARisque = Array.from(clientOldest.values()).filter(d => d > 90).length;

    return { totalEncours, encoursHorsGroupe, recouvrementMois, clientsARisque };
  }, [allSolde, groupClientNames, factures]);

  // ─── Section 1: Top Clients ───
  const topClients = useMemo(() => {
    const clientMap = new Map<string, { nom: string; montantDu: number; unpaidCount: number; oldestDate: string; oldestDays: number }>();

    solde.filter(c => c.montantDu > 0).forEach(c => {
      clientMap.set(c.nom.toLowerCase().trim(), {
        nom: c.nom,
        montantDu: c.montantDu,
        unpaidCount: 0,
        oldestDate: "",
        oldestDays: 0,
      });
    });

    factures.filter(f => getPaymentStatus(f.paiement) === "unpaid" || getPaymentStatus(f.paiement) === "partial").forEach(f => {
      const key = f.nomClient.toLowerCase().trim();
      const entry = clientMap.get(key);
      if (entry) {
        entry.unpaidCount++;
        const days = daysSince(f.dateFacture);
        if (days > entry.oldestDays) {
          entry.oldestDays = days;
          entry.oldestDate = f.dateFacture;
        }
      }
    });

    return Array.from(clientMap.values())
      .sort((a, b) => b.montantDu - a.montantDu);
  }, [solde, factures]);

  const displayedClients = showAllClients ? topClients : topClients.slice(0, 20);

  // ─── Section 2: Monthly Collections ───
  const monthlyCollections = useMemo(() => {
    const months: { key: string; label: string; start: Date; end: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const s = startOfMonth(d);
      const e = endOfMonth(d);
      months.push({
        key: format(s, "yyyy-MM"),
        label: format(s, "MMM yy", { locale: fr }),
        start: s,
        end: e,
      });
    }

    return months.map(m => {
      const amount = factures
        .filter(f => {
          if (!f.datePaiement) return false;
          const d = new Date(f.datePaiement);
          return !isNaN(d.getTime()) && isWithinInterval(d, { start: m.start, end: m.end });
        })
        .reduce((s, f) => s + f.montantRecouvre, 0);
      return { month: m.label, montant: Math.round(amount) };
    });
  }, [factures]);

  const paidThisMonth = useMemo(() => {
    const now = new Date();
    const ms = startOfMonth(now);
    const me = endOfMonth(now);
    const clientPayments = new Map<string, number>();
    factures.forEach(f => {
      if (!f.datePaiement) return;
      const d = new Date(f.datePaiement);
      if (!isNaN(d.getTime()) && isWithinInterval(d, { start: ms, end: me }) && f.montantRecouvre > 0) {
        const key = f.nomClient;
        clientPayments.set(key, (clientPayments.get(key) || 0) + f.montantRecouvre);
      }
    });
    return Array.from(clientPayments.entries())
      .map(([client, amount]) => ({ client, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [factures]);

  // ─── Section 3: Cash-In Forecasts ───
  const forecasts = useMemo(() => {
    const today = new Date();
    const unpaidRaw = factures
      .filter(f => getPaymentStatus(f.paiement) === "unpaid" || getPaymentStatus(f.paiement) === "partial");
    // Cap by real client balance
    const capped = capInvoicesByClientBalance(unpaidRaw, solde);
    const unpaid = capped.map(f => ({
      ...f,
      echeance: new Date(computeEcheance(f.echeancePrevue, f.dateFacture)),
    }));

    const makeBucket = (maxDays: number) => {
      const cutoff = new Date(today);
      cutoff.setDate(cutoff.getDate() + maxDays);
      const matching = unpaid.filter(f => f.echeance <= cutoff);
      const total = matching.reduce((s, f) => s + f.montantRecouvrement, 0);
      const byClient = new Map<string, { amount: number; count: number }>();
      matching.forEach(f => {
        const key = f.nomClient;
        const entry = byClient.get(key) || { amount: 0, count: 0 };
        entry.amount += f.montantRecouvrement;
        entry.count++;
        byClient.set(key, entry);
      });
      const topClients = Array.from(byClient.entries())
        .map(([name, d]) => ({ name, ...d }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
      return { total, count: matching.length, topClients };
    };

    return {
      d7: makeBucket(7),
      d30: makeBucket(30),
      d60: makeBucket(60),
    };
  }, [factures, solde]);

  // ─── Section 4: Aging Donut ───
  const agingData = useMemo(() => {
    const unpaid = factures.filter(f => getPaymentStatus(f.paiement) === "unpaid" || getPaymentStatus(f.paiement) === "partial");
    return AGING_BRACKETS.map(b => {
      const matching = unpaid.filter(f => {
        const d = daysSince(f.dateFacture);
        return d >= b.min && d <= b.max;
      });
      return {
        name: b.key,
        value: matching.reduce((s, f) => s + f.montantRecouvrement, 0),
        count: matching.length,
        color: b.color,
      };
    }).filter(d => d.count > 0);
  }, [factures]);

  const agingDrawerInvoices = useMemo(() => {
    if (!agingDrawerBracket) return [];
    const bracket = AGING_BRACKETS.find(b => b.key === agingDrawerBracket);
    if (!bracket) return [];
    return factures
      .filter(f => {
        const st = getPaymentStatus(f.paiement);
        if (st !== "unpaid" && st !== "partial") return false;
        const d = daysSince(f.dateFacture);
        return d >= bracket.min && d <= bracket.max;
      })
      .sort((a, b) => daysSince(b.dateFacture) - daysSince(a.dateFacture));
  }, [factures, agingDrawerBracket]);

  // ─── Section 5: Smart Alerts ───
  const alerts = useMemo(() => {
    const result: { icon: typeof AlertTriangle; client: string; description: string; severity: number }[] = [];
    const unpaid = factures.filter(f => getPaymentStatus(f.paiement) === "unpaid");

    // Group by client, find critical ones
    const clientData = new Map<string, { oldestDays: number; totalDue: number; count: number }>();
    unpaid.forEach(f => {
      const key = f.nomClient;
      const entry = clientData.get(key) || { oldestDays: 0, totalDue: 0, count: 0 };
      const days = daysSince(f.dateFacture);
      entry.oldestDays = Math.max(entry.oldestDays, days);
      entry.totalDue += f.montantRecouvrement;
      entry.count++;
      clientData.set(key, entry);
    });

    clientData.forEach((data, client) => {
      if (data.oldestDays > 180) {
        result.push({
          icon: AlertTriangle,
          client,
          description: `${data.count} facture(s) impayée(s) depuis +${data.oldestDays}j — ${formatDT(data.totalDue)}`,
          severity: data.oldestDays * data.totalDue,
        });
      } else if (data.oldestDays > 90) {
        result.push({
          icon: Phone,
          client,
          description: `Relance urgente — ${data.count} facture(s), retard ${data.oldestDays}j`,
          severity: data.oldestDays * data.totalDue,
        });
      } else if (data.oldestDays > 60) {
        result.push({
          icon: Mail,
          client,
          description: `Relance recommandée — ${formatDT(data.totalDue)} en retard de ${data.oldestDays}j`,
          severity: data.oldestDays * data.totalDue,
        });
      }
    });

    return result.sort((a, b) => b.severity - a.severity).slice(0, 5);
  }, [factures]);

  const filterButtons: { key: GroupFilter; label: string }[] = [
    { key: "all", label: "Tous" },
    { key: "external", label: "Hors Groupe" },
    { key: "group", label: "Groupe Medianet" },
  ];

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    if (datePickerStep === "from") {
      setDateRange(prev => ({ ...prev, from: date }));
      setDatePickerStep("to");
    } else {
      setDateRange(prev => ({ ...prev, to: date }));
      setDatePickerOpen(false);
      setDatePickerStep("from");
    }
  };

  const hasAnyData = allFactures.length > 0 || allSolde.length > 0;

  if (!hasAnyData) {
    return (
      <div className="p-6 animate-fade-in">
        <h2 className="text-2xl font-bold text-foreground mb-6">Tableau de bord</h2>
        <Card className="shadow-sm border-dashed">
          <CardContent className="py-16 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground font-medium">Aucune donnée importée</p>
            <p className="text-sm text-muted-foreground mt-1">Allez dans Paramètres pour importer vos fichiers Excel.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header + Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-foreground">Tableau de bord</h2>
        <div className="flex items-center bg-muted rounded-lg p-1 gap-0.5">
          {filterButtons.map(fb => (
            <button
              key={fb.key}
              onClick={() => setGroupFilter(fb.key)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                groupFilter === fb.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {fb.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={Wallet} label="Total Encours" value={formatDT(kpis.totalEncours)} color="text-primary" />
        <KPICard icon={TrendingDown} label="Encours Hors Groupe" value={formatDT(kpis.encoursHorsGroupe)} color="text-destructive" />
        <KPICard icon={CalendarCheck} label="Recouvrement mois en cours" value={formatDT(kpis.recouvrementMois)} color="text-success" />
        <KPICard icon={AlertTriangle} label="Clients à risque" value={String(kpis.clientsARisque)} color="text-warning" subtitle="> 90 jours" />
      </div>

      {/* Section 1 — Top Clients */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Top Clients par Encours</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setShowAllClients(!showAllClients)} className="text-primary text-xs">
            {showAllClients ? "Réduire" : "Voir tous"}
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Encours (DT)</TableHead>
                <TableHead className="text-center">Impayées</TableHead>
                <TableHead>Plus ancienne</TableHead>
                <TableHead className="text-center">Statut IA</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedClients.map((c, i) => {
                const status = getAIStatus(c.oldestDays);
                return (
                  <TableRow
                    key={c.nom}
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={() => navigate(`/encours?client=${encodeURIComponent(c.nom)}`)}
                  >
                    <TableCell className="text-muted-foreground font-medium">{i + 1}</TableCell>
                    <TableCell className="font-medium text-foreground">{c.nom}</TableCell>
                    <TableCell className="text-right font-semibold text-foreground">{formatDT(c.montantDu)}</TableCell>
                    <TableCell className="text-center">
                      {c.unpaidCount > 0 ? (
                        <span className="text-destructive font-medium">{c.unpaidCount}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {c.oldestDate ? (
                        <span>{c.oldestDate} <span className="text-xs">({c.oldestDays}j)</span></span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="default" className={status.className}>{status.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
              {displayedClients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Aucun client avec encours</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section 2 — Monthly Collections */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Recouvrement mensuel</CardTitle>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs gap-2">
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(dateRange.from, "MMM yy", { locale: fr })} – {format(dateRange.to, "MMM yy", { locale: fr })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="p-3 text-sm text-muted-foreground text-center border-b">
                Sélectionnez la date de {datePickerStep === "from" ? "début" : "fin"}
              </div>
              <Calendar
                mode="single"
                selected={datePickerStep === "from" ? dateRange.from : dateRange.to}
                onSelect={handleDateSelect}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </CardHeader>
        <CardContent>
          {monthlyCollections.some(m => m.montant > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyCollections}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(215 16% 47%)" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(215 16% 47%)" tickFormatter={v => formatDT(v)} />
                <Tooltip formatter={(v: number) => [formatDT(v), "Recouvré"]} />
                <Bar dataKey="montant" fill="hsl(142, 72%, 29%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-8">Aucun recouvrement enregistré.</p>
          )}

          {paidThisMonth.length > 0 && (
            <div className="mt-4 border-t pt-4">
              <p className="text-sm font-medium text-foreground mb-2">Clients ayant payé ce mois</p>
              <div className="space-y-1.5">
                {paidThisMonth.slice(0, 8).map(p => (
                  <div key={p.client} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{p.client}</span>
                    <span className="font-medium text-success">{formatDT(p.amount)}</span>
                  </div>
                ))}
                {paidThisMonth.length > 8 && (
                  <p className="text-xs text-muted-foreground">+{paidThisMonth.length - 8} autres clients</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3 — Cash-In Forecasts */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-3">Prévisions Cash-In</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {([
            { label: "Dans 7 jours", data: forecasts.d7, filter: "7" },
            { label: "Dans 30 jours", data: forecasts.d30, filter: "30" },
            { label: "Dans 60 jours", data: forecasts.d60, filter: "60" },
          ] as const).map(bucket => (
            <Card
              key={bucket.label}
              className="shadow-sm cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/previsions?horizon=${bucket.filter}`)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground font-medium">{bucket.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-primary">{formatDT(bucket.data.total)}</p>
                <p className="text-xs text-muted-foreground mb-3">{bucket.data.count} facture(s)</p>
                {bucket.data.topClients.length > 0 && (
                  <div className="space-y-1.5 border-t pt-3">
                    {bucket.data.topClients.map(c => (
                      <div key={c.name} className="flex items-center justify-between text-xs">
                        <span className="text-foreground truncate mr-2">{c.name}</span>
                        <span className="text-muted-foreground whitespace-nowrap">{formatDT(c.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Section 4 — Aging Donut */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Ancienneté des Factures Impayées</CardTitle>
        </CardHeader>
        <CardContent>
          {agingData.length > 0 ? (
            <div className="flex flex-col lg:flex-row items-center gap-6">
              <ResponsiveContainer width={320} height={280}>
                <PieChart>
                  <Pie
                    data={agingData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={110}
                    dataKey="value"
                    nameKey="name"
                    onClick={(entry) => setAgingDrawerBracket(entry.name)}
                    className="cursor-pointer"
                    stroke="hsl(0 0% 100%)"
                    strokeWidth={2}
                  >
                    {agingData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [formatDT(v), "Montant"]} />
                  <Legend
                    verticalAlign="bottom"
                    formatter={(value: string) => <span className="text-xs text-foreground">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2 w-full">
                {agingData.map(d => (
                  <button
                    key={d.name}
                    onClick={() => setAgingDrawerBracket(d.name)}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-accent/50 transition-colors text-sm"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-foreground font-medium">{d.name}</span>
                      <span className="text-muted-foreground">({d.count})</span>
                    </div>
                    <span className="font-semibold text-foreground">{formatDT(d.value)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Aucune facture impayée.</p>
          )}
        </CardContent>
      </Card>

      {/* Section 5 — Smart Alerts */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Alertes Intelligentes</CardTitle>
          <Button variant="ghost" size="sm" className="text-primary text-xs" onClick={() => navigate("/actions")}>
            Voir toutes les alertes <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </CardHeader>
        <CardContent>
          {alerts.length > 0 ? (
            <div className="space-y-3">
              {alerts.map((alert, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-accent/40 hover:bg-accent/60 transition-colors">
                  <div className="mt-0.5 h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                    <alert.icon className="h-4 w-4 text-destructive" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{alert.client}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{alert.description}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/actions?client=${encodeURIComponent(alert.client)}`);
                    }}
                  >
                    Relancer
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-6">Aucune alerte pour le moment.</p>
          )}
        </CardContent>
      </Card>

      {/* Aging Drawer */}
      <Sheet open={!!agingDrawerBracket} onOpenChange={() => setAgingDrawerBracket(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Factures — {agingDrawerBracket}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {agingDrawerInvoices.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucune facture dans cette tranche.</p>
            )}
            {agingDrawerInvoices.map(f => (
              <div key={f.numFacture} className="p-3 rounded-lg border bg-background">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{f.numFacture}</span>
                  <span className="text-sm font-semibold text-foreground">{formatDT(f.montantRecouvrement)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{f.nomClient}</p>
                <p className="text-xs text-muted-foreground">Date: {f.dateFacture} • {daysSince(f.dateFacture)}j</p>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, color, subtitle }: {
  icon: typeof Wallet;
  label: string;
  value: string;
  color: string;
  subtitle?: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={cn("text-2xl font-bold", color)}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", color, "bg-current/5")}>
            <Icon className={cn("h-5 w-5", color)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
