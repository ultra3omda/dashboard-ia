import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Legend, LabelList, Cell,
} from "recharts";
import {
  Sparkles, TrendingUp, Clock, AlertTriangle, ShieldAlert,
  CheckCircle2, Info, Filter, Users, DollarSign, Target, ArrowRight,
  Lightbulb, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnalyticsSummary, useAnalyticsSuggestions } from "@/hooks/useData";
import {
  AGING_BUCKET_DEFS, AGING_BUCKET_ORDER, bucketRangeLabel,
  formatTND, formatPct,
} from "@/lib/analytics";
import type { AnalyticsFiltersQS, Suggestion } from "@/lib/apiEndpoints";
import { getFactures } from "@/lib/storage";

// ──────────────────────────────────────────────────────────────────────
// Small presentational components
// ──────────────────────────────────────────────────────────────────────

type KpiTone = "default" | "success" | "warning" | "danger";

function KpiCard({
  icon: Icon, label, value, hint, tone = "default",
  suggestions, kpiKey, onRequestSuggestions, suggestionsLoading,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string;
  hint?: string;
  tone?: KpiTone;
  suggestions?: Suggestion[];
  kpiKey: string;
  onRequestSuggestions: () => void;
  suggestionsLoading: boolean;
}) {
  const toneClass = {
    default: "bg-primary/10 text-primary",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700",
  }[tone];
  const hasSuggestions = (suggestions?.length ?? 0) > 0;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold mt-1 truncate">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
          <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", toneClass)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full justify-start text-xs text-muted-foreground hover:text-primary"
              onClick={() => { if (!hasSuggestions) onRequestSuggestions(); }}
              data-kpi={kpiKey}
            >
              <Lightbulb className="h-3.5 w-3.5 mr-1.5" />
              {suggestionsLoading
                ? "Chargement des suggestions IA…"
                : hasSuggestions
                  ? `${suggestions!.length} suggestion${suggestions!.length > 1 ? "s" : ""} IA`
                  : "Voir les suggestions IA"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96" align="end">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">Actions suggérées</span>
              </div>
              {suggestionsLoading && !hasSuggestions && (
                <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyse des données…
                </div>
              )}
              {!suggestionsLoading && !hasSuggestions && (
                <p className="text-sm text-muted-foreground py-3">
                  Aucune suggestion disponible pour ce KPI.
                </p>
              )}
              {hasSuggestions && suggestions!.map((s, i) => <SuggestionItem key={i} suggestion={s} />)}
            </div>
          </PopoverContent>
        </Popover>
      </CardContent>
    </Card>
  );
}

function SuggestionItem({ suggestion }: { suggestion: Suggestion }) {
  const config = {
    info: "border-sky-200 bg-sky-50",
    success: "border-emerald-200 bg-emerald-50",
    warning: "border-amber-200 bg-amber-50",
    danger: "border-red-200 bg-red-50",
  }[suggestion.severity];
  return (
    <div className={cn("rounded-md border p-3", config)}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="font-semibold text-sm">{suggestion.title}</p>
        <Badge variant="outline" className="text-[10px] shrink-0">{suggestion.action}</Badge>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{suggestion.detail}</p>
    </div>
  );
}

function EmptyState() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Sparkles className="h-8 w-8 text-primary" />
      </div>
      <h2 className="text-xl font-bold mb-2">Aucune donnée à analyser</h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        Importez vos fichiers Excel (Solde clients + Factures) pour accéder aux
        analyses IA, aux filtres avancés et au classement des retards.
      </p>
      <Button onClick={() => navigate("/parametres")}>Importer mes données</Button>
    </div>
  );
}

function InsightCard({ suggestion }: { suggestion: Suggestion }) {
  const config = {
    info: { Icon: Info, cls: "border-sky-200 bg-sky-50 text-sky-900" },
    success: { Icon: CheckCircle2, cls: "border-emerald-200 bg-emerald-50 text-emerald-900" },
    warning: { Icon: AlertTriangle, cls: "border-amber-200 bg-amber-50 text-amber-900" },
    danger: { Icon: ShieldAlert, cls: "border-red-200 bg-red-50 text-red-900" },
  }[suggestion.severity];
  const { Icon } = config;
  return (
    <div className={cn("rounded-lg border p-4 flex gap-3", config.cls)}>
      <Icon className="h-5 w-5 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-sm">{suggestion.title}</p>
          <Badge variant="outline" className="text-[10px] shrink-0 bg-white/60">{suggestion.action}</Badge>
        </div>
        <p className="text-sm mt-1 opacity-90">{suggestion.detail}</p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────────────

export default function AnalyseIA() {
  const navigate = useNavigate();

  const [filters, setFilters] = useState<AnalyticsFiltersQS>({
    activite: null, group_mode: "all", date_from: null, date_to: null, only_overdue: false,
  });
  const [topClientsMode, setTopClientsMode] = useState<"ca" | "recouvre" | "reste">("ca");
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(false);

  const summaryQuery = useAnalyticsSummary(filters);
  const suggestionsQuery = useAnalyticsSuggestions(filters, suggestionsEnabled);

  const activites = useMemo(() => {
    const set = new Set<string>();
    getFactures().forEach(f => {
      const a = (f.activite || "").trim();
      if (a) set.add(a);
    });
    return Array.from(set).sort();
  }, []);

  if (summaryQuery.isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (summaryQuery.isError) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card>
          <CardContent className="p-6">
            <p className="font-semibold text-destructive mb-2">Erreur de chargement</p>
            <p className="text-sm text-muted-foreground">
              Impossible de récupérer les analyses. Vérifiez votre connexion puis rechargez.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = summaryQuery.data;
  if (!data || (data.kpis.nbFactures === 0 && data.kpis.nbClients === 0)) {
    return <EmptyState />;
  }

  const { kpis, clientPerformance, activityBreakdown, agingBuckets } = data;

  const agingChartData = AGING_BUCKET_ORDER.map(cat => ({
    name: AGING_BUCKET_DEFS[cat].label,
    range: bucketRangeLabel(cat, agingBuckets),
    montant: kpis.agingTotals[cat],
    nb: kpis.agingCounts[cat],
    fill: AGING_BUCKET_DEFS[cat].color,
  }));

  const activityChartData = activityBreakdown.slice(0, 8).map(a => ({
    activite: a.activite.length > 14 ? a.activite.slice(0, 12) + "…" : a.activite,
    fullName: a.activite,
    caRealise: a.caRealise,
    montantRecouvre: a.montantRecouvre,
  }));

  const topClients = [...clientPerformance]
    .sort((a, b) => {
      if (topClientsMode === "ca") return b.caRealise - a.caRealise;
      if (topClientsMode === "recouvre") return b.montantRecouvre - a.montantRecouvre;
      return b.resteARecouvrer - a.resteARecouvrer;
    })
    .slice(0, 15);

  const delaiMoyen = kpis.delaiMoyenPaiement;
  const delaiValue = delaiMoyen !== null ? `${Math.round(delaiMoyen)} j` : "—";
  const delaiHint = delaiMoyen === null
    ? "Aucune facture payée"
    : delaiMoyen > 60 ? "Au-dessus de la norme B2B" : "Dans la norme";
  const delaiTone: KpiTone = delaiMoyen === null ? "default" : delaiMoyen > 60 ? "warning" : "success";

  const suggestions = suggestionsQuery.data;
  const handleRequestSuggestions = () => setSuggestionsEnabled(true);

  const filterChanged =
    filters.activite !== null || filters.group_mode !== "all" ||
    filters.date_from !== null || filters.date_to !== null ||
    filters.only_overdue === true;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Analyse IA</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Recouvrement intelligent — classement des retards, suggestions IA par KPI, top performers
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {kpis.nbFactures} factures • {kpis.nbClients} clients
        </Badge>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span className="font-medium">Filtres</span>
            </div>

            <Select
              value={filters.activite ?? "ALL"}
              onValueChange={v => setFilters(f => ({ ...f, activite: v === "ALL" ? null : v }))}
            >
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Activité" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toutes activités</SelectItem>
                {activites.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select
              value={filters.group_mode ?? "all"}
              onValueChange={v => setFilters(f => ({ ...f, group_mode: v as AnalyticsFiltersQS["group_mode"] }))}
            >
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous clients</SelectItem>
                <SelectItem value="external">Hors groupe</SelectItem>
                <SelectItem value="group">Groupe</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              className="w-[155px]"
              value={filters.date_from ?? ""}
              onChange={e => setFilters(f => ({ ...f, date_from: e.target.value || null }))}
            />
            <Input
              type="date"
              className="w-[155px]"
              value={filters.date_to ?? ""}
              onChange={e => setFilters(f => ({ ...f, date_to: e.target.value || null }))}
            />

            <Button
              variant={filters.only_overdue ? "default" : "outline"}
              size="sm"
              onClick={() => setFilters(f => ({ ...f, only_overdue: !f.only_overdue }))}
            >
              <Clock className="h-4 w-4 mr-1" />
              En retard uniquement
            </Button>

            {filterChanged && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters({ activite: null, group_mode: "all", date_from: null, date_to: null, only_overdue: false })}
              >
                Réinitialiser
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={DollarSign} label="CA réalisé" value={formatTND(kpis.caRealise)}
          hint={`${kpis.nbFactures} factures`} tone="default" kpiKey="caRealise"
          suggestions={suggestions?.concentration}
          onRequestSuggestions={handleRequestSuggestions}
          suggestionsLoading={suggestionsQuery.isLoading && suggestionsEnabled}
        />
        <KpiCard
          icon={CheckCircle2} label="Taux de recouvrement" value={formatPct(kpis.tauxRecouvrement)}
          hint={formatTND(kpis.montantRecouvre) + " recouvrés"}
          tone={kpis.tauxRecouvrement >= 0.85 ? "success" : kpis.tauxRecouvrement >= 0.7 ? "warning" : "danger"}
          kpiKey="tauxRecouvrement" suggestions={suggestions?.tauxRecouvrement}
          onRequestSuggestions={handleRequestSuggestions}
          suggestionsLoading={suggestionsQuery.isLoading && suggestionsEnabled}
        />
        <KpiCard
          icon={Clock} label="Reste à recouvrer" value={formatTND(kpis.resteARecouvrer)}
          hint={`${kpis.nbClientsEnRetard} clients en retard`} tone="warning"
          kpiKey="resteARecouvrer" suggestions={suggestions?.resteARecouvrer}
          onRequestSuggestions={handleRequestSuggestions}
          suggestionsLoading={suggestionsQuery.isLoading && suggestionsEnabled}
        />
        <KpiCard
          icon={Target} label="Délai moyen de paiement" value={delaiValue}
          hint={delaiHint} tone={delaiTone} kpiKey="delaiMoyenPaiement"
          suggestions={suggestions?.delaiMoyenPaiement}
          onRequestSuggestions={handleRequestSuggestions}
          suggestionsLoading={suggestionsQuery.isLoading && suggestionsEnabled}
        />
      </div>

      {suggestions && (suggestions.retardsCritiques?.length || suggestions.concentration?.length) ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              Actions prioritaires
              {suggestions._source === "claude" && (
                <Badge variant="outline" className="ml-2 text-[10px]">IA Claude</Badge>
              )}
              {suggestions._source === "scripted_fallback" && (
                <Badge variant="outline" className="ml-2 text-[10px] bg-amber-50">Mode dégradé</Badge>
              )}
              {suggestions._source === "scripted" && (
                <Badge variant="outline" className="ml-2 text-[10px]">Règles métier</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {suggestions.retardsCritiques?.map((s, i) => <InsightCard key={`rc-${i}`} suggestion={s} />)}
              {suggestions.concentration?.map((s, i) => <InsightCard key={`cc-${i}`} suggestion={s} />)}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Classement des retards
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Répartition du reste à recouvrer par niveau de criticité (seuils configurables dans Paramètres)
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2 grid grid-cols-2 gap-3">
              {AGING_BUCKET_ORDER.map(cat => {
                const def = AGING_BUCKET_DEFS[cat];
                return (
                  <div key={cat} className="rounded-lg border p-4" style={{ borderLeft: `4px solid ${def.color}` }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold">{def.label}</span>
                      <Badge variant="outline" className={cn("text-[10px]", def.badgeClass)}>
                        {bucketRangeLabel(cat, agingBuckets)}
                      </Badge>
                    </div>
                    <p className="text-xl font-bold mt-2">{formatTND(kpis.agingTotals[cat])}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {kpis.agingCounts[cat]} facture{kpis.agingCounts[cat] > 1 ? "s" : ""}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="lg:col-span-3 min-h-[260px]">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={agingChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v)} />
                  <Tooltip
                    formatter={(v: number) => formatTND(v)}
                    labelFormatter={(label: string, payload) =>
                      payload?.[0]
                        ? `${label} (${payload[0].payload.range}) • ${payload[0].payload.nb} facture${payload[0].payload.nb > 1 ? "s" : ""}`
                        : label
                    }
                  />
                  <Bar dataKey="montant" radius={[6, 6, 0, 0]}>
                    {agingChartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    <LabelList
                      dataKey="montant" position="top"
                      formatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v > 0 ? Math.round(v) : "")}
                      style={{ fontSize: 11, fill: "#64748b" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-primary" />
              Top clients
            </CardTitle>
            <Tabs value={topClientsMode} onValueChange={v => setTopClientsMode(v as typeof topClientsMode)} className="mt-3">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="ca">CA réalisé</TabsTrigger>
                <TabsTrigger value="recouvre">Recouvré</TabsTrigger>
                <TabsTrigger value="reste">Reste à recouvrer</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[480px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[40px]">#</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">
                      {topClientsMode === "ca" ? "CA HT" : topClientsMode === "recouvre" ? "Recouvré" : "Reste"}
                    </TableHead>
                    <TableHead className="text-right">Taux</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topClients.map((c, idx) => {
                    const value = topClientsMode === "ca" ? c.caRealise : topClientsMode === "recouvre" ? c.montantRecouvre : c.resteARecouvrer;
                    const def = AGING_BUCKET_DEFS[c.pireAging];
                    return (
                      <TableRow
                        key={c.nomClient}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/encours?client=${encodeURIComponent(c.nomClient)}`)}
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {c.nomClient}
                          {c.isGroup && <Badge variant="outline" className="ml-2 text-[10px]">Groupe</Badge>}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatTND(value)}</TableCell>
                        <TableCell className="text-right text-sm">{formatPct(c.tauxRecouvrement)}</TableCell>
                        <TableCell>
                          {c.nbImpayees > 0 ? (
                            <Badge variant="outline" className={cn("text-[10px]", def.badgeClass)}>{def.label}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-600 border-slate-200">À jour</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {topClients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Aucun client correspondant aux filtres
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
              Performance par activité
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">CA réalisé et montant recouvré</p>
          </CardHeader>
          <CardContent>
            {activityChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={activityChartData} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v)} />
                  <YAxis type="category" dataKey="activite" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip
                    formatter={(v: number, name: string) => [formatTND(v), name === "caRealise" ? "CA HT" : "Recouvré"]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload.fullName || ""}
                  />
                  <Legend
                    formatter={v => v === "caRealise" ? "CA HT" : v === "montantRecouvre" ? "Recouvré" : v}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="caRealise" fill="hsl(210, 80%, 55%)" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="montantRecouvre" fill="hsl(142, 72%, 45%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-12">Aucune donnée</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldAlert className="h-5 w-5 text-red-600" />
            Clients à risque (Critique + Danger)
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Clients dont la facture la plus ancienne dépasse le seuil de vigilance
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Reste à recouvrer</TableHead>
                <TableHead className="text-right">Nb impayées</TableHead>
                <TableHead>Répartition retards</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientPerformance
                .filter(c => c.resteARecouvrer > 0 && (c.pireAging === "critique" || c.pireAging === "danger"))
                .sort((a, b) => b.resteARecouvrer - a.resteARecouvrer)
                .slice(0, 20)
                .map(c => {
                  const def = AGING_BUCKET_DEFS[c.pireAging];
                  const total = AGING_BUCKET_ORDER.reduce((s, cat) => s + c.agingMix[cat], 0);
                  return (
                    <TableRow
                      key={c.nomClient}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/encours?client=${encodeURIComponent(c.nomClient)}`)}
                    >
                      <TableCell className="font-medium max-w-[250px] truncate">
                        {c.nomClient}
                        {c.isGroup && <Badge variant="outline" className="ml-2 text-[10px]">Groupe</Badge>}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatTND(c.resteARecouvrer)}</TableCell>
                      <TableCell className="text-right">{c.nbImpayees}</TableCell>
                      <TableCell>
                        <div className="flex h-2 w-full max-w-[200px] rounded-full overflow-hidden bg-slate-100">
                          {AGING_BUCKET_ORDER.map(cat => {
                            const amt = c.agingMix[cat];
                            const pct = total > 0 ? (amt / total) * 100 : 0;
                            if (pct === 0) return null;
                            return (
                              <div
                                key={cat}
                                style={{ width: `${pct}%`, backgroundColor: AGING_BUCKET_DEFS[cat].color }}
                                title={`${AGING_BUCKET_DEFS[cat].label}: ${formatTND(amt)}`}
                              />
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[10px]", def.badgeClass)}>{def.label}</Badge>
                      </TableCell>
                      <TableCell><ArrowRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  );
                })}
              {clientPerformance.filter(c => c.pireAging === "critique" || c.pireAging === "danger").length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    🎉 Aucun client en zone Critique ou Danger
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
